import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

/**
 * VacanciesController
 *
 * Read-only endpoints for the AdminVacanciesPage.
 *
 * Write endpoints (create/update/delete) → VacancyCrudController
 * Match/enrichment/encuadre endpoints   → VacancyMatchController
 * Talentum/prescreening endpoints        → VacancyTalentumController
 */
export class VacanciesController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  async listVacancies(req: Request, res: Response): Promise<void> {
    try {
      const {
        search,
        client,
        status,
        limit = '20',
        offset = '0'
      } = req.query;

      let query = `
        SELECT
          jp.id,
          jp.case_number,
          jp.vacancy_number,
          jp.title,
          jp.status,
          p.zone_neighborhood as patient_zone,
          jp.search_start_date,
          jp.created_at,
          jp.updated_at,
          get_applicant_count(jp.id) AS current_applicants,
          jp.max_applicants,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.dependency_level,
          CASE
            WHEN jp.search_start_date IS NOT NULL
            THEN EXTRACT(DAY FROM NOW() - jp.search_start_date)::INTEGER
            ELSE 0
          END as dias_aberto,
          (
            SELECT COUNT(*)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
          ) as convidados,
          (
            SELECT COUNT(DISTINCT worker_id)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
              AND e.worker_id IS NOT NULL
          ) as postulados,
          (
            SELECT COUNT(*)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
              AND e.resultado = 'SELECCIONADO'
          ) as selecionados,
          CASE
            WHEN jp.providers_needed IS NOT NULL
            THEN jp.providers_needed::INTEGER - (
              SELECT COUNT(*)
              FROM encuadres e
              WHERE e.job_posting_id = jp.id
                AND e.resultado = 'SELECCIONADO'
            )
            ELSE NULL
          END as faltantes
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE jp.case_number IS NOT NULL
          AND jp.deleted_at IS NULL
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (
          p.first_name ILIKE $${paramIndex}
          OR p.last_name ILIKE $${paramIndex}
          OR jp.case_number::TEXT ILIKE $${paramIndex}
          OR jp.vacancy_number::TEXT ILIKE $${paramIndex}
          OR jp.title ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (client) {
        query += ` AND p.insurance_verified = $${paramIndex}`;
        params.push(client);
        paramIndex++;
      }

      if (status) {
        if (status === 'ativo') {
          query += ` AND jp.status IN ('searching', 'active', 'ACTIVO', 'rta_rapida', 'EQUIPO RESPUESTA RAPIDA', 'replacement', 'REEMPLAZOS', 'BUSQUEDA', 'ACTIVACION PENDIENTE')`;
        } else if (status === 'inativo') {
          query += ` AND jp.status IN ('paused', 'on_hold', 'SUSPENDIDO TEMPORALMENTE', 'EN ESPERA')`;
        } else if (status === 'processo') {
          query += ` AND jp.status IN ('replacement', 'REEMPLAZOS')`;
        }
      }

      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0');

      query += ` ORDER BY jp.created_at DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await this.db.query(query, params);

      const vacancies = result.rows.map(row => ({
        id: row.id,
        initials: this.getInitials(row.patient_first_name, row.patient_last_name),
        name: `${row.patient_first_name || ''} ${row.patient_last_name || ''}`.trim(),
        email: '',
        caso: `Caso ${row.case_number}-${row.vacancy_number}`,
        vacancyNumber: row.vacancy_number,
        status: this.mapStatus(row.status),
        grau: this.mapDependency(row.dependency_level),
        grauColor: this.getDependencyColor(row.dependency_level),
        diasAberto: row.dias_aberto?.toString().padStart(2, '0') || '00',
        convidados: row.convidados?.toString().padStart(2, '0') || '00',
        postulados: row.postulados?.toString() || '',
        selecionados: row.selecionados?.toString() || '',
        faltantes: row.faltantes?.toString() || ''
      }));

      res.status(200).json({ success: true, data: vacancies, total, limit: parseInt(limit as string), offset: parseInt(offset as string) });
    } catch (error: any) {
      console.error('[VacanciesController] Error listing vacancies:', error);
      res.status(500).json({ success: false, error: 'Failed to list vacancies', details: error.message });
    }
  }

  async getVacanciesStats(req: Request, res: Response): Promise<void> {
    try {
      const query = `
        SELECT
          COUNT(*) FILTER (
            WHERE search_start_date IS NOT NULL
              AND EXTRACT(DAY FROM NOW() - search_start_date) > 7
              AND status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as mais_7_dias,
          COUNT(*) FILTER (
            WHERE search_start_date IS NOT NULL
              AND EXTRACT(DAY FROM NOW() - search_start_date) > 24
              AND status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as mais_24_dias,
          COUNT(DISTINCT jp.id) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM encuadres e
              WHERE e.job_posting_id = jp.id
            )
          ) as em_selecao,
          COUNT(*) FILTER (
            WHERE status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as total_vacantes,
          AVG(
            CASE
              WHEN search_start_date IS NOT NULL
                AND status NOT IN ('BUSQUEDA', 'REEMPLAZO')
              THEN EXTRACT(EPOCH FROM (updated_at - search_start_date)) / 3600
              ELSE NULL
            END
          ) as tempo_medio_fechamento
        FROM job_postings jp
        WHERE case_number IS NOT NULL
          AND deleted_at IS NULL
      `;

      const result = await this.db.query(query);
      const stats = result.rows[0];

      const formattedStats = [
        { label: '+7 dias', value: stats.mais_7_dias?.toString() || '0', icon: 'clock' as const },
        { label: '+24 dias', value: stats.mais_24_dias?.toString() || '0', icon: 'clock' as const },
        { label: 'Em seleção', value: stats.em_selecao?.toString() || '0', icon: 'user-check' as const },
        {
          label: 'Total de Vacantes',
          value: stats.tempo_medio_fechamento
            ? `${Math.round(parseFloat(stats.tempo_medio_fechamento))}h`
            : '0h',
          icon: 'user-search' as const,
        },
      ];

      res.status(200).json({ success: true, data: formattedStats });
    } catch (error: any) {
      console.error('[VacanciesController] Error fetching stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch vacancies stats', details: error.message });
    }
  }

  async getVacancyById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          jp.*,
          jp.id as id,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.zone_neighborhood as patient_zone,
          p.dependency_level as patient_dependency_level,
          p.diagnosis as patient_diagnosis,
          p.insurance_verified,
          le.llm_required_sex,
          le.llm_required_profession,
          le.llm_required_specialties,
          le.llm_required_diagnoses,
          le.llm_enriched_at,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', e.id,
              'worker_name', e.worker_raw_name,
              'worker_phone', COALESCE(w.phone, e.worker_raw_phone),
              'interview_date', e.interview_date,
              'resultado', e.resultado,
              'attended', e.attended,
              'rejection_reason_category', e.rejection_reason_category,
              'rejection_reason', e.rejection_reason
            )
          ) FILTER (WHERE e.id IS NOT NULL) as encuadres,
          json_agg(
            DISTINCT jsonb_build_object(
              'channel', pub.channel,
              'published_at', pub.published_at,
              'recruiter', pub.recruiter_name
            )
          ) FILTER (WHERE pub.id IS NOT NULL) as publications
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        LEFT JOIN job_postings_llm_enrichment le ON le.job_posting_id = jp.id
        LEFT JOIN encuadres e ON jp.id = e.job_posting_id
        LEFT JOIN workers w ON e.worker_id = w.id
        LEFT JOIN publications pub ON jp.id = pub.job_posting_id
        WHERE jp.id = $1
        GROUP BY jp.id, p.id, p.first_name, p.last_name, p.zone_neighborhood,
                 p.dependency_level, p.diagnosis, p.insurance_verified,
                 le.llm_required_sex, le.llm_required_profession,
                 le.llm_required_specialties, le.llm_required_diagnoses,
                 le.llm_enriched_at
      `;

      const result = await this.db.query(query, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Vacancy not found' });
        return;
      }

      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      console.error('[VacanciesController] Error fetching vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch vacancy', details: error.message });
    }
  }

  async getNextVacancyNumber(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT nextval('job_postings_vacancy_number_seq') AS next_vacancy_number`
      );
      const nextVacancyNumber = parseInt(result.rows[0].next_vacancy_number);
      res.status(200).json({ success: true, data: { nextVacancyNumber } });
    } catch (error: any) {
      console.error('[VacanciesController] Error getting next vacancy number:', error);
      res.status(500).json({ success: false, error: 'Failed to get next vacancy number' });
    }
  }

  async getNextCaseNumber(req: Request, res: Response): Promise<void> {
    return this.getNextVacancyNumber(req, res);
  }

  // ── Helpers ──────────────────────────────────────────────────

  private getInitials(firstName: string | null, lastName: string | null): string {
    const first = firstName?.charAt(0)?.toUpperCase() || '';
    const last = lastName?.charAt(0)?.toUpperCase() || '';
    return first + last || 'XX';
  }

  private mapStatus(clickupStatus: string | null): string {
    const statusMap: Record<string, string> = {
      'BUSQUEDA': 'Ativo',
      'REEMPLAZO': 'Em Processo',
      'CUBIERTO': 'Inativo',
      'CANCELADO': 'Inativo'
    };
    return statusMap[clickupStatus || ''] || 'Esperando Ativação';
  }

  private mapDependency(dependency: string | null): string {
    const depMap: Record<string, string> = {
      'MUY_GRAVE': 'Muito Grave',
      'GRAVE': 'Grave',
      'MODERADA': 'Moderado',
      'LEVE': 'Leve'
    };
    return depMap[dependency || ''] || 'Moderado';
  }

  private getDependencyColor(dependency: string | null): string {
    const colorMap: Record<string, string> = {
      'MUY_GRAVE': 'text-[#ed0006]',
      'GRAVE': 'text-[#f9a000]',
      'MODERADA': 'text-[#fdc405]',
      'LEVE': 'text-[#81c784]'
    };
    return colorMap[dependency || ''] || 'text-[#fdc405]';
  }
}
