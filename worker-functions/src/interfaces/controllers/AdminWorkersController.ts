import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { KMSEncryptionService } from '../../infrastructure/security/KMSEncryptionService';

const DOCS_COMPLETE_STATUSES = ['submitted', 'under_review', 'approved'];

function mapPlatformLabel(dataSources: string[]): string {
  if (!dataSources || dataSources.length === 0) return 'enlite_app';
  if (dataSources.some(s => s === 'candidatos' || s === 'candidatos_no_terminaron')) return 'talentum';
  if (dataSources.includes('planilla_operativa')) return 'planilla_operativa';
  if (dataSources.includes('ana_care')) return 'ana_care';
  if (dataSources.includes('talent_search')) return 'talent_search';
  return dataSources[0];
}

interface WorkerDateStats {
  today: number;
  yesterday: number;
  sevenDaysAgo: number;
}

/**
 * AdminWorkersController
 *
 * Endpoints:
 * - GET /api/admin/workers       - Lista workers com filtros e paginação
 * - GET /api/admin/workers/stats - Contagem de cadastros por data (hoje/ontem/7 dias atrás)
 */
export class AdminWorkersController {
  private db: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  /**
   * GET /api/admin/workers
   * Query params: platform, docs_complete ('complete'|'incomplete'), limit, offset
   * Ordena por created_at DESC (mais recentes primeiro).
   */
  async listWorkers(req: Request, res: Response): Promise<void> {
    try {
      const {
        platform,
        docs_complete,
        limit = '20',
        offset = '0',
      } = req.query as Record<string, string>;

      const params: unknown[] = [];
      let paramIndex = 1;

      let whereClause = 'WHERE w.merged_into_id IS NULL';

      // Filtro por plataforma de origem
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

      // Filtro por documentação completa ou faltante
      if (docs_complete === 'complete') {
        whereClause += ` AND wd.documents_status = ANY(ARRAY['submitted','under_review','approved'])`;
      } else if (docs_complete === 'incomplete') {
        whereClause += ` AND (wd.documents_status IS NULL OR wd.documents_status NOT IN ('submitted','under_review','approved'))`;
      }

      const baseQuery = `
        SELECT
          w.id,
          w.email,
          w.first_name_encrypted,
          w.last_name_encrypted,
          w.data_sources,
          w.created_at,
          COALESCE(wd.documents_status, 'pending') AS documents_status,
          COUNT(DISTINCT e.job_posting_id)
            FILTER (WHERE e.resultado = 'SELECCIONADO') AS cases_count
        FROM workers w
        LEFT JOIN worker_documents wd ON wd.worker_id = w.id
        LEFT JOIN encuadres e ON e.worker_id = w.id
        ${whereClause}
        GROUP BY w.id, wd.documents_status
      `;

      // Total (sem paginação)
      const countResult = await this.db.query(
        `SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub`,
        params,
      );
      const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

      // Página
      const dataQuery = `${baseQuery} ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const result = await this.db.query(dataQuery, params);

      // Descriptografar nomes em paralelo (todos os workers da página de uma vez)
      const decryptedWorkers = await Promise.all(
        result.rows.map(async (row) => {
          const [firstName, lastName] = await Promise.all([
            this.encryptionService.decrypt(row.first_name_encrypted),
            this.encryptionService.decrypt(row.last_name_encrypted),
          ]);

          const name = [firstName, lastName].filter(Boolean).join(' ') || row.email;
          const docsComplete = DOCS_COMPLETE_STATUSES.includes(row.documents_status);
          const platform = mapPlatformLabel(row.data_sources ?? []);

          return {
            id: row.id,
            name,
            email: row.email,
            casesCount: parseInt(row.cases_count ?? '0', 10),
            documentsStatus: row.documents_status,
            documentsComplete: docsComplete,
            platform,
            createdAt: row.created_at,
          };
        }),
      );

      res.status(200).json({
        success: true,
        data: decryptedWorkers,
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
    } catch (error: any) {
      console.error('[AdminWorkersController] listWorkers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list workers',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/admin/workers/stats
   * Retorna contagem de workers cadastrados hoje, ontem e exatamente 7 dias atrás.
   * Aplica WHERE merged_into_id IS NULL para consistência com listWorkers.
   */
  async getWorkerDateStats(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query<{
        today: string;
        yesterday: string;
        seven_days_ago: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)::int       AS today,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1)::int   AS yesterday,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 7)::int   AS seven_days_ago
        FROM workers
        WHERE merged_into_id IS NULL
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
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas de workers',
        details: error.message,
      });
    }
  }
}
