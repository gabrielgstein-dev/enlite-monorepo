import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { KMSEncryptionService } from '../../infrastructure/security/KMSEncryptionService';
import { GCSStorageService } from '../../infrastructure/services/GCSStorageService';
import { generatePhoneCandidates } from '../../infrastructure/scripts/import-utils';
import { mapPlatformLabel, matchesSearch, WorkerListItem } from './AdminWorkersControllerHelpers';
import { buildWorkerDetailResponse } from './AdminWorkersDetailBuilder';

interface WorkerDateStats {
  today: number;
  yesterday: number;
  sevenDaysAgo: number;
}

// Campos selecionados para detalhe de worker — compartilhado por getWorkerById e getWorkerByPhone
const WORKER_DETAIL_COLS = [
  'w.id, w.email, w.phone, w.country, w.timezone, w.status',
  'w.data_sources, w.created_at, w.updated_at, w.deleted_at',
  'w.document_type, w.profession, w.occupation, w.knowledge_level',
  'w.title_certificate, w.experience_types, w.years_experience',
  'w.preferred_types, w.preferred_age_range, w.hobbies, w.diagnostic_preferences',
  'w.first_name_encrypted, w.last_name_encrypted, w.birth_date_encrypted',
  'w.sex_encrypted, w.gender_encrypted, w.document_number_encrypted',
  'w.profile_photo_url_encrypted, w.languages_encrypted',
  'w.whatsapp_phone_encrypted, w.linkedin_url_encrypted',
  'w.sexual_orientation_encrypted, w.race_encrypted, w.religion_encrypted',
  'w.weight_kg_encrypted, w.height_cm_encrypted',
].join(', ');

/**
 * AdminWorkersController
 *
 * Endpoints:
 * - GET /api/admin/workers                 - Lista workers com filtros e paginação
 * - GET /api/admin/workers/stats           - Contagem de cadastros por data
 * - GET /api/admin/workers/case-options    - Lista casos (job_postings) para select
 * - GET /api/admin/workers/by-phone        - Detalhes completos de um worker por telefone
 * - GET /api/admin/workers/:id             - Detalhes completos de um worker por ID
 */
export class AdminWorkersController {
  private db: Pool;
  private encryptionService: KMSEncryptionService;
  private readonly gcs = new GCSStorageService();

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  private async decryptWorkerListRow(row: any): Promise<{ firstName: string; lastName: string; phone: string; worker: WorkerListItem }> {
    const [firstName, lastName] = await Promise.all([
      this.encryptionService.decrypt(row.first_name_encrypted),
      this.encryptionService.decrypt(row.last_name_encrypted),
    ]);
    return {
      firstName: firstName ?? '',
      lastName: lastName ?? '',
      phone: row.phone ?? '',
      worker: {
        id: row.id,
        name: [firstName, lastName].filter(Boolean).join(' ') || row.email,
        email: row.email,
        casesCount: parseInt(row.cases_count ?? '0', 10),
        documentsStatus: row.documents_status,
        documentsComplete: row.status === 'REGISTERED',
        status: row.status,
        platform: mapPlatformLabel(row.data_sources ?? []),
        createdAt: row.created_at,
      },
    };
  }

  /** GET /api/admin/workers — lista com filtros e paginação */
  async listWorkers(req: Request, res: Response): Promise<void> {
    try {
      const { platform, docs_complete, search, case_id, limit = '20', offset = '0' } = req.query as Record<string, string>;
      const params: unknown[] = [];
      let paramIndex = 1;
      let whereClause = 'WHERE w.merged_into_id IS NULL';

      if (platform) {
        if (platform === 'talentum') {
          whereClause += ` AND (w.data_sources && ARRAY['candidatos', 'candidatos_no_terminaron']::text[])`;
        } else if (platform === 'enlite_app') {
          whereClause += ` AND (w.data_sources IS NULL OR w.data_sources = '{}')`;
        } else {
          whereClause += ` AND ($${paramIndex} = ANY(w.data_sources))`;
          params.push(platform);
          paramIndex++;
        }
      }

      if (docs_complete === 'complete') {
        whereClause += ` AND w.status = 'REGISTERED'`;
      } else if (docs_complete === 'incomplete') {
        whereClause += ` AND w.status = 'INCOMPLETE_REGISTER'`;
      }

      if (case_id) {
        whereClause += ` AND EXISTS (SELECT 1 FROM encuadres e2 WHERE e2.worker_id = w.id AND e2.job_posting_id = $${paramIndex})`;
        params.push(case_id);
        paramIndex++;
      }

      const searchTerm = search?.trim().toLowerCase();

      const baseQuery = `
        SELECT w.id, w.email, w.phone, w.first_name_encrypted, w.last_name_encrypted,
          w.data_sources, w.created_at, w.status,
          COALESCE(wd.documents_status, 'pending') AS documents_status,
          COUNT(DISTINCT e.job_posting_id) FILTER (WHERE e.resultado = 'SELECCIONADO') AS cases_count
        FROM workers w
        LEFT JOIN worker_documents wd ON wd.worker_id = w.id
        LEFT JOIN encuadres e ON e.worker_id = w.id
        ${whereClause}
        GROUP BY w.id, wd.documents_status
      `;

      if (searchTerm) {
        // Names are encrypted — fetch larger set, decrypt, filter by name/email/phone, paginate in code
        const fetchParams = [...params, 500];
        const result = await this.db.query(`${baseQuery} ORDER BY w.created_at DESC LIMIT $${paramIndex}`, fetchParams);

        const decryptedAll = await Promise.all(result.rows.map((row) => this.decryptWorkerListRow(row)));
        const filtered = decryptedAll.filter(
          ({ firstName, lastName, worker, phone }) => matchesSearch(searchTerm, [firstName, lastName, worker.email, phone]),
        );

        const paginatedOffset = parseInt(offset, 10);
        const paginatedLimit = parseInt(limit, 10);
        const data = filtered.slice(paginatedOffset, paginatedOffset + paginatedLimit).map(({ worker }) => worker);
        res.status(200).json({ success: true, data, total: filtered.length, limit: paginatedLimit, offset: paginatedOffset });
      } else {
        const countResult = await this.db.query(`SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub`, params);
        const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

        const dataQuery = `${baseQuery} ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));
        const result = await this.db.query(dataQuery, params);

        const data = (await Promise.all(result.rows.map((row) => this.decryptWorkerListRow(row)))).map(({ worker }) => worker);
        res.status(200).json({ success: true, data, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
      }
    } catch (error: any) {
      console.error('[AdminWorkersController] listWorkers error:', error);
      res.status(500).json({ success: false, error: 'Failed to list workers', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/case-options
   * Retorna id + label de todos os job_postings ativos para popular selects de filtro.
   */
  async listCaseOptions(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT jp.id, jp.case_number, jp.vacancy_number, jp.title,
               p.first_name AS patient_first_name, p.last_name AS patient_last_name
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE jp.deleted_at IS NULL AND jp.status != 'draft'
        ORDER BY jp.case_number DESC NULLS LAST, jp.vacancy_number DESC
      `);

      const data = result.rows.map((row: any) => {
        const patientName = [row.patient_first_name, row.patient_last_name].filter(Boolean).join(' ');
        const label = patientName
          ? `${row.title} — ${patientName}`
          : row.title;
        return { value: row.id, label };
      });

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AdminWorkersController] listCaseOptions error:', error);
      res.status(500).json({ success: false, error: 'Failed to list case options', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/:id
   * Retorna detalhes completos de um worker por ID.
   */
  async getWorkerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const workerResult = await this.db.query(
        `SELECT ${WORKER_DETAIL_COLS} FROM workers w WHERE w.id = $1 AND w.merged_into_id IS NULL`,
        [id],
      );
      if (workerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }
      const data = await buildWorkerDetailResponse(this.db, this.encryptionService, this.gcs, workerResult.rows[0]);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerById error:', error);
      res.status(500).json({ success: false, error: 'Failed to get worker details', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/by-phone?phone=...
   * Busca worker pelo número de telefone. Retorna os mesmos dados completos de getWorkerById.
   */
  async getWorkerByPhone(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.query as Record<string, string>;
      if (!phone || phone.trim() === '') {
        res.status(400).json({ success: false, error: 'Query parameter "phone" is required' });
        return;
      }
      const candidates = generatePhoneCandidates(phone);
      if (candidates.length === 0) {
        res.status(400).json({ success: false, error: 'Query parameter "phone" is required' });
        return;
      }
      const workerResult = await this.db.query(
        `SELECT ${WORKER_DETAIL_COLS} FROM workers w WHERE w.phone = ANY($1::text[]) AND w.merged_into_id IS NULL`,
        [candidates],
      );
      if (workerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }
      const data = await buildWorkerDetailResponse(this.db, this.encryptionService, this.gcs, workerResult.rows[0]);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerByPhone error:', error);
      res.status(500).json({ success: false, error: 'Failed to get worker details', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/stats
   * Retorna contagem de workers cadastrados hoje, ontem e nos últimos 7 dias.
   */
  async getWorkerDateStats(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query<{ today: string; yesterday: string; seven_days_ago: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)::int       AS today,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1)::int   AS yesterday,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 7)::int  AS seven_days_ago
        FROM workers WHERE merged_into_id IS NULL
      `);
      const row = result.rows[0];
      const stats: WorkerDateStats = {
        today: parseInt(row.today, 10),
        yesterday: parseInt(row.yesterday, 10),
        sevenDaysAgo: parseInt(row.seven_days_ago, 10),
      };
      res.status(200).json({ success: true, data: stats });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerDateStats error:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas de workers', details: error.message });
    }
  }
}
