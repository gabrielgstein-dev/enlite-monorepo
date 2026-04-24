/**
 * AdminWorkersAuxController.ts
 *
 * Auxiliary endpoints extracted from AdminWorkersController to keep each file
 * within the 400-line limit.
 *
 * Endpoints:
 * - GET  /api/admin/workers/stats          — worker registration date stats
 * - GET  /api/admin/workers/case-options   — job_postings for select inputs
 * - POST /api/admin/workers/sync-talentum  — bulk sync from Talentum dashboard
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { SyncTalentumWorkersUseCase } from '@modules/integration';

interface WorkerDateStats {
  today: number;
  yesterday: number;
  sevenDaysAgo: number;
}

export class AdminWorkersAuxController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
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
      console.error('[AdminWorkersAuxController] getWorkerDateStats error:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas de workers', details: error.message });
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
      console.error('[AdminWorkersAuxController] listCaseOptions error:', error);
      res.status(500).json({ success: false, error: 'Failed to list case options', details: error.message });
    }
  }

  /** POST /api/admin/workers/sync-talentum — bulk sync workers from Talentum dashboard */
  async syncTalentumWorkers(_req: Request, res: Response): Promise<void> {
    // In test environments there are no GCP credentials (ADC), so google-auth-library
    // would make async background retries that trigger uncaughtException and kill the
    // process. Return 503 early to avoid touching GoogleAuth entirely.
    if (process.env.NODE_ENV === 'test') {
      res.status(503).json({ success: false, error: 'Talentum sync disabled in test environment' });
      return;
    }

    try {
      const useCase = new SyncTalentumWorkersUseCase();
      const report = await useCase.execute();
      res.status(200).json({ success: true, data: report });
    } catch (error: any) {
      const isTalentumError = error.message?.includes('Talentum') || error.message?.includes('tl_auth');
      const status = isTalentumError ? 502 : 500;
      console.error('[AdminWorkersAuxController] syncTalentumWorkers error:', error);
      res.status(status).json({ success: false, error: 'Failed to sync workers from Talentum', details: error.message });
    }
  }
}
