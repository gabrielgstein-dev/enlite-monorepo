import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { MatchmakingService } from '../../infrastructure/services/MatchmakingService';
import { JobPostingEnrichmentService } from '../../infrastructure/services/JobPostingEnrichmentService';

/**
 * VacanciesController
 * 
 * Endpoints para alimentar o AdminVacanciesPage
 * 
 * Endpoints:
 * - GET /api/admin/vacancies - Lista todas as vagas com filtros
 * - GET /api/admin/vacancies/stats - Estatísticas das vagas
 * - GET /api/admin/vacancies/:id - Detalhes de uma vaga específica
 * - POST /api/admin/vacancies - Criar nova vaga
 * - PUT /api/admin/vacancies/:id - Atualizar vaga
 * - DELETE /api/admin/vacancies/:id - Deletar vaga
 */
export class VacanciesController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * GET /api/admin/vacancies
   * 
   * Lista todas as vagas com filtros e paginação
   */
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
          jp.title,
          jp.status,
          p.zone_neighborhood as patient_zone,
          jp.search_start_date,
          jp.created_at,
          jp.updated_at,
          jp.current_applicants,
          jp.max_applicants,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.dependency_level,
          -- Contar dias em aberto
          CASE 
            WHEN jp.search_start_date IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - jp.search_start_date)::INTEGER
            ELSE 0
          END as dias_aberto,
          -- Contar convidados (encuadres)
          (
            SELECT COUNT(*)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
          ) as convidados,
          -- Contar postulados (workers únicos em encuadres)
          (
            SELECT COUNT(DISTINCT worker_id)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
              AND e.worker_id IS NOT NULL
          ) as postulados,
          -- Contar selecionados
          (
            SELECT COUNT(*)
            FROM encuadres e
            WHERE e.job_posting_id = jp.id
              AND e.resultado = 'SELECCIONADO'
          ) as selecionados,
          -- Calcular faltantes (providers_needed - selecionados)
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
      `;

      const params: any[] = [];
      let paramIndex = 1;

      // Filtro por busca (nome do paciente ou número do caso)
      if (search) {
        query += ` AND (
          p.first_name ILIKE $${paramIndex} 
          OR p.last_name ILIKE $${paramIndex}
          OR jp.case_number::TEXT ILIKE $${paramIndex}
          OR jp.title ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Filtro por cliente/obra social (não temos esse campo ainda, mas podemos usar insurance)
      if (client) {
        query += ` AND p.insurance_verified = $${paramIndex}`;
        params.push(client);
        paramIndex++;
      }

      // Filtro por status
      if (status) {
        if (status === 'ativo') {
          query += ` AND jp.status IN ('searching', 'active', 'rta_rapida', 'replacement', 'REEMPLAZOS')`;
        } else if (status === 'inativo') {
          query += ` AND jp.status IN ('paused', 'on_hold')`;
        } else if (status === 'processo') {
          query += ` AND jp.status IN ('replacement', 'REEMPLAZOS')`;
        }
      }

      // Contar total antes da paginação
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0');

      // Adicionar ordenação e paginação
      query += ` ORDER BY jp.search_start_date DESC NULLS LAST, jp.created_at DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await this.db.query(query, params);

      // Mapear para o formato esperado pela tela
      const vacancies = result.rows.map(row => ({
        id: row.id,
        initials: this.getInitials(row.patient_first_name, row.patient_last_name),
        name: `${row.patient_first_name || ''} ${row.patient_last_name || ''}`.trim(),
        email: '', // Não temos email do paciente na vaga
        caso: `Caso ${row.case_number}`,
        status: this.mapStatus(row.status),
        grau: this.mapDependency(row.dependency_level),
        grauColor: this.getDependencyColor(row.dependency_level),
        diasAberto: row.dias_aberto?.toString().padStart(2, '0') || '00',
        convidados: row.convidados?.toString().padStart(2, '0') || '00',
        postulados: row.postulados?.toString() || '',
        selecionados: row.selecionados?.toString() || '',
        faltantes: row.faltantes?.toString() || ''
      }));

      res.status(200).json({
        success: true,
        data: vacancies,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error listing vacancies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list vacancies',
        details: error.message
      });
    }
  }

  /**
   * GET /api/admin/vacancies/stats
   * 
   * Retorna estatísticas das vagas
   */
  async getVacanciesStats(req: Request, res: Response): Promise<void> {
    try {
      const query = `
        SELECT 
          -- Vagas com mais de 7 dias em aberto
          COUNT(*) FILTER (
            WHERE search_start_date IS NOT NULL 
              AND EXTRACT(DAY FROM NOW() - search_start_date) > 7
              AND status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as mais_7_dias,
          -- Vagas com mais de 24 dias em aberto
          COUNT(*) FILTER (
            WHERE search_start_date IS NOT NULL 
              AND EXTRACT(DAY FROM NOW() - search_start_date) > 24
              AND status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as mais_24_dias,
          -- Vagas em seleção (com pelo menos 1 encuadre)
          COUNT(DISTINCT jp.id) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM encuadres e 
              WHERE e.job_posting_id = jp.id
            )
          ) as em_selecao,
          -- Total de vagas ativas
          COUNT(*) FILTER (
            WHERE status IN ('BUSQUEDA', 'REEMPLAZO')
          ) as total_vacantes,
          -- Tempo médio de fechamento (em horas)
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
      `;

      const result = await this.db.query(query);
      const stats = result.rows[0];

      const formattedStats = [
        {
          label: '+7 dias',
          value: stats.mais_7_dias?.toString() || '0',
          icon: 'clock' as const
        },
        {
          label: '+24 dias',
          value: stats.mais_24_dias?.toString() || '0',
          icon: 'clock' as const
        },
        {
          label: 'Em seleção',
          value: stats.em_selecao?.toString() || '0',
          icon: 'user-check' as const
        },
        {
          label: 'Total de Vacantes',
          value: stats.tempo_medio_fechamento 
            ? `${Math.round(parseFloat(stats.tempo_medio_fechamento))}h`
            : '0h',
          icon: 'user-search' as const
        }
      ];

      res.status(200).json({
        success: true,
        data: formattedStats
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch vacancies stats',
        details: error.message
      });
    }
  }

  /**
   * GET /api/admin/vacancies/:id
   * 
   * Retorna detalhes de uma vaga específica
   */
  async getVacancyById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const query = `
        SELECT 
          jp.*,
          p.*,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', e.id,
              'worker_name', COALESCE(w.first_name || ' ' || w.last_name, e.worker_raw_name),
              'worker_phone', COALESCE(w.phone, e.worker_raw_phone),
              'interview_date', e.interview_date,
              'resultado', e.resultado,
              'attended', e.attended
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
        LEFT JOIN encuadres e ON jp.id = e.job_posting_id
        LEFT JOIN workers w ON e.worker_id = w.id
        LEFT JOIN publications pub ON jp.id = pub.job_posting_id
        WHERE jp.id = $1
        GROUP BY jp.id, p.id
      `;

      const result = await this.db.query(query, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Vacancy not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error fetching vacancy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch vacancy',
        details: error.message
      });
    }
  }

  /**
   * POST /api/admin/vacancies
   * 
   * Criar nova vaga (caso)
   */
  async createVacancy(req: Request, res: Response): Promise<void> {
    try {
      const {
        case_number,
        title,
        patient_id,
        diagnosis,
        worker_profile_sought,
        schedule_days_hours,
        providers_needed
      } = req.body;

      const query = `
        INSERT INTO job_postings (
          case_number,
          title,
          patient_id,
          diagnosis,
          worker_profile_sought,
          schedule_days_hours,
          providers_needed,
          status,
          country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'BUSQUEDA', 'AR')
        RETURNING *
      `;

      const result = await this.db.query(query, [
        case_number,
        title || `Caso ${case_number}`,
        patient_id,
        diagnosis,
        worker_profile_sought,
        schedule_days_hours,
        providers_needed
      ]);

      const newVacancy = result.rows[0];

      // Dispara enrich + match em background sem bloquear a resposta
      setImmediate(() => {
        const enrichmentService = new JobPostingEnrichmentService();
        const matchingService   = new MatchmakingService();

        enrichmentService.enrichJobPosting(newVacancy.id)
          .then(() => matchingService.matchWorkersForJob(newVacancy.id))
          .then(matchResult => {
            console.log(`[VacanciesController] Auto-match concluído para vaga ${newVacancy.id}: ${matchResult.candidates.length} candidatos`);
          })
          .catch(err => {
            console.error(`[VacanciesController] Erro no auto-match para vaga ${newVacancy.id}:`, err.message);
          });
      });

      res.status(201).json({
        success: true,
        data: newVacancy
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error creating vacancy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create vacancy',
        details: error.message
      });
    }
  }

  /**
   * PUT /api/admin/vacancies/:id
   * 
   * Atualizar vaga existente
   */
  async updateVacancy(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Construir query dinâmica baseada nos campos enviados
      const allowedFields = [
        'title', 'diagnosis', 'worker_profile_sought', 'schedule_days_hours',
        'providers_needed', 'status', 'daily_obs', 'patient_id'
      ];

      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(updates[key]);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
        return;
      }

      values.push(id);
      const query = `
        UPDATE job_postings
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Vacancy not found'
        });
        return;
      }

      // Re-enrich in background if free-text fields changed
      const needsReEnrich = ['worker_profile_sought', 'schedule_days_hours', 'diagnosis'].some(
        f => Object.keys(updates).includes(f)
      );
      if (needsReEnrich) {
        setImmediate(() => {
          const enrichmentService = new JobPostingEnrichmentService();
          enrichmentService.enrichJobPosting(id).catch(err => {
            console.error(`[VacanciesController] Re-enrich failed for vacancy ${id}:`, err.message);
          });
        });
      }

      res.status(200).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error updating vacancy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update vacancy',
        details: error.message
      });
    }
  }

  /**
   * DELETE /api/admin/vacancies/:id
   * 
   * Deletar vaga (soft delete - muda status)
   */
  async deleteVacancy(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const query = `
        UPDATE job_postings
        SET status = 'closed', updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `;

      const result = await this.db.query(query, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Vacancy not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Vacancy deleted successfully'
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error deleting vacancy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete vacancy',
        details: error.message
      });
    }
  }

  /**
   * POST /api/admin/vacancies/:id/match
   *
   * Dispara o matchmaking para uma vaga específica.
   * Retorna os candidatos rankeados por score de compatibilidade.
   * Salva os resultados em worker_job_applications.match_score.
   */
  async triggerMatch(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const topN                 = req.query.top_n             ? parseInt(req.query.top_n as string)       : 20;
      const radiusKm             = req.query.radius_km         ? parseInt(req.query.radius_km as string)   : null;
      const excludeWithActiveCases = req.query.exclude_active === 'true';

      const matchingService = new MatchmakingService();
      const result = await matchingService.matchWorkersForJob(id, topN, radiusKm, excludeWithActiveCases);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error triggering match:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run matchmaking',
        details: error.message,
      });
    }
  }

  /**
   * POST /api/admin/vacancies/:id/enrich
   *
   * Re-parseia os campos de texto livre da vaga (worker_profile_sought,
   * schedule_days_hours) com LLM e salva os campos estruturados.
   * Útil para re-enriquecimento manual após edição da vaga.
   */
  async reEnrichJobPosting(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const enrichmentService = new JobPostingEnrichmentService();
      const result = await enrichmentService.enrichJobPosting(id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[VacanciesController] Error enriching job posting:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to enrich job posting',
        details: error.message,
      });
    }
  }

  // Helper methods
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
