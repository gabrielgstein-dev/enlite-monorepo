import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { UpdateEncuadreResultUseCase } from '../../application/use-cases/UpdateEncuadreResultUseCase';

/**
 * EncuadreFunnelController
 *
 * Endpoints for encuadre funnel (kanban) management and coordinator dashboard.
 *
 * - GET  /api/admin/vacancies/:id/funnel         — encuadres grouped by stage
 * - PUT  /api/admin/encuadres/:id/move            — move encuadre in kanban
 * - GET  /api/admin/dashboard/coordinator-capacity — coordinator metrics
 * - GET  /api/admin/dashboard/alerts               — problem case alerts
 */
export class EncuadreFunnelController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * GET /api/admin/vacancies/:id/funnel
   *
   * Returns encuadres for a vacancy grouped by funnel stage.
   */
  async getEncuadreFunnel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.db.query(
        `SELECT
           e.id,
           e.worker_raw_name AS worker_name,
           COALESCE(w.phone, e.worker_raw_phone) AS worker_phone,
           e.occupation_raw,
           e.interview_date,
           e.interview_time,
           e.meet_link,
           e.resultado,
           e.attended,
           e.rejection_reason_category,
           e.rejection_reason,
           e.redireccionamiento,
           wja.match_score,
           wja.application_funnel_stage AS talentum_status,
           wl.work_zone
         FROM encuadres e
         LEFT JOIN workers w ON w.id = e.worker_id
         LEFT JOIN worker_job_applications wja
           ON wja.worker_id = e.worker_id AND wja.job_posting_id = e.job_posting_id
         LEFT JOIN worker_locations wl ON wl.worker_id = e.worker_id
         WHERE e.job_posting_id = $1
         ORDER BY e.interview_date DESC NULLS LAST, e.created_at DESC`,
        [id]
      );

      const stages: Record<string, unknown[]> = {
        INVITED: [],
        INITIATED: [],
        IN_PROGRESS: [],
        COMPLETED: [],
        CONFIRMED: [],
        INTERVIEWING: [],
        SELECTED: [],
        REJECTED: [],
        PENDING: [],
      };

      const now = new Date();
      const today = now.toISOString().split('T')[0];

      for (const row of result.rows) {
        const item = {
          id: row.id,
          workerName: row.worker_name,
          workerPhone: row.worker_phone,
          occupation: row.occupation_raw,
          interviewDate: row.interview_date,
          interviewTime: row.interview_time,
          meetLink: row.meet_link,
          resultado: row.resultado,
          attended: row.attended,
          rejectionReasonCategory: row.rejection_reason_category,
          rejectionReason: row.rejection_reason,
          matchScore: row.match_score,
          talentumStatus: row.talentum_status ?? null,
          workZone: row.work_zone,
          redireccionamiento: row.redireccionamiento,
        };

        // Encuadres with a final resultado are classified first
        if (['SELECCIONADO', 'REEMPLAZO'].includes(row.resultado)) {
          stages.SELECTED.push(item);
        } else if (['RECHAZADO', 'AT_NO_ACEPTA', 'BLACKLIST'].includes(row.resultado)) {
          stages.REJECTED.push(item);
        } else if (['PENDIENTE', 'REPROGRAMAR'].includes(row.resultado)) {
          stages.PENDING.push(item);
        } else if (row.talentum_status === 'INITIATED') {
          stages.INITIATED.push(item);
        } else if (row.talentum_status === 'IN_PROGRESS') {
          stages.IN_PROGRESS.push(item);
        } else if (['COMPLETED', 'QUALIFIED', 'IN_DOUBT'].includes(row.talentum_status)) {
          stages.COMPLETED.push(item);
        } else if (row.interview_date && String(row.interview_date).startsWith(today) && !row.attended) {
          // Interview today and not yet attended
          stages.INTERVIEWING.push(item);
        } else if (row.meet_link && row.interview_date && String(row.interview_date) >= today && !row.attended) {
          // Has meet link, interview in the future, not yet attended
          stages.CONFIRMED.push(item);
        } else {
          // Everything else: scheduled but not confirmed, or no interview date
          stages.INVITED.push(item);
        }
      }

      res.json({
        success: true,
        data: {
          stages,
          totalEncuadres: result.rows.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EncuadreFunnelController] funnel error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  /**
   * PUT /api/admin/encuadres/:id/move
   *
   * Updates encuadre resultado when dragged between kanban columns.
   */
  async moveEncuadre(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { resultado, rejectionReasonCategory, rejectionReason } = req.body;

      if (!resultado) {
        res.status(400).json({ success: false, error: 'resultado is required' });
        return;
      }

      const useCase = new UpdateEncuadreResultUseCase();
      const result = await useCase.execute({
        encuadreId: id,
        resultado,
        rejectionReasonCategory: rejectionReasonCategory ?? null,
        rejectionReason: rejectionReason ?? null,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }

  /**
   * GET /api/admin/dashboard/coordinator-capacity
   *
   * Returns per-coordinator capacity metrics.
   */
  async getCoordinatorCapacity(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT
          c.id,
          c.name,
          -- Latest weekly hours from coordinator_weekly_schedules
          (
            SELECT cws.weekly_hours
            FROM coordinator_weekly_schedules cws
            WHERE cws.coordinator_id = c.id
            ORDER BY cws.to_date DESC
            LIMIT 1
          ) AS weekly_hours,
          -- Active cases (not covered)
          (
            SELECT COUNT(*)::int
            FROM job_postings jp
            WHERE jp.coordinator_id = c.id
              AND jp.is_covered = false
              AND jp.deleted_at IS NULL
          ) AS active_cases,
          -- Encuadres this week
          (
            SELECT COUNT(*)::int
            FROM encuadres e
            JOIN job_postings jp ON jp.id = e.job_posting_id
            WHERE jp.coordinator_id = c.id
              AND e.interview_date >= date_trunc('week', CURRENT_DATE)
              AND e.interview_date < date_trunc('week', CURRENT_DATE) + interval '7 days'
          ) AS encuadres_this_week,
          -- Conversion rate: SELECCIONADO / total attended
          (
            SELECT COUNT(*) FILTER (WHERE e.resultado = 'SELECCIONADO')::float
              / NULLIF(COUNT(*) FILTER (WHERE e.attended = true), 0)
            FROM encuadres e
            JOIN job_postings jp ON jp.id = e.job_posting_id
            WHERE jp.coordinator_id = c.id
          ) AS conversion_rate,
          -- Total cases managed
          (
            SELECT COUNT(*)::int
            FROM job_postings jp
            WHERE jp.coordinator_id = c.id
              AND jp.deleted_at IS NULL
          ) AS total_cases
        FROM coordinators c
        ORDER BY c.name
      `);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          weeklyHours: row.weekly_hours ? parseFloat(row.weekly_hours) : null,
          activeCases: row.active_cases,
          encuadresThisWeek: row.encuadres_this_week,
          conversionRate: row.conversion_rate ? parseFloat(row.conversion_rate) : null,
          totalCases: row.total_cases,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EncuadreFunnelController] capacity error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  /**
   * GET /api/admin/dashboard/alerts
   *
   * Returns problem cases that need human intervention.
   */
  async getAlerts(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT
          jp.id,
          jp.case_number,
          jp.title,
          jp.coordinator_name,
          jp.search_start_date,
          jp.is_covered,
          EXTRACT(DAY FROM NOW() - jp.search_start_date)::int AS days_open,
          (SELECT COUNT(*)::int FROM encuadres e WHERE e.job_posting_id = jp.id) AS total_encuadres,
          (SELECT COUNT(*)::int FROM encuadres e
           WHERE e.job_posting_id = jp.id AND e.resultado = 'SELECCIONADO') AS selected_count,
          (SELECT COUNT(*)::int FROM encuadres e
           WHERE e.job_posting_id = jp.id
             AND e.created_at >= NOW() - interval '7 days') AS recent_encuadres
        FROM job_postings jp
        WHERE jp.deleted_at IS NULL
          AND jp.is_covered = false
          AND (
            -- Cases with >200 encuadres without success
            (SELECT COUNT(*) FROM encuadres e
             WHERE e.job_posting_id = jp.id) > 200
            AND (SELECT COUNT(*) FROM encuadres e
                 WHERE e.job_posting_id = jp.id AND e.resultado = 'SELECCIONADO') = 0
            -- OR cases open >30 days without coverage
            OR (jp.search_start_date IS NOT NULL
                AND jp.search_start_date < NOW() - interval '30 days')
            -- OR cases with 0 candidates in last 7 days
            OR (SELECT COUNT(*) FROM encuadres e
                WHERE e.job_posting_id = jp.id
                  AND e.created_at >= NOW() - interval '7 days') = 0
          )
        ORDER BY
          CASE
            WHEN (SELECT COUNT(*) FROM encuadres e WHERE e.job_posting_id = jp.id) > 200 THEN 1
            WHEN jp.search_start_date < NOW() - interval '30 days' THEN 2
            ELSE 3
          END,
          jp.search_start_date ASC NULLS LAST
      `);

      const alerts = result.rows.map(row => {
        const reasons: string[] = [];
        if (row.total_encuadres > 200 && row.selected_count === 0) {
          reasons.push('MORE_THAN_200_ENCUADRES');
        }
        if (row.days_open > 30) {
          reasons.push('OPEN_MORE_THAN_30_DAYS');
        }
        if (row.recent_encuadres === 0) {
          reasons.push('NO_CANDIDATES_LAST_7_DAYS');
        }

        return {
          jobPostingId: row.id,
          caseNumber: row.case_number,
          title: row.title,
          coordinatorName: row.coordinator_name,
          daysOpen: row.days_open,
          totalEncuadres: row.total_encuadres,
          selectedCount: row.selected_count,
          recentEncuadres: row.recent_encuadres,
          alertReasons: reasons,
        };
      });

      res.json({ success: true, data: alerts });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EncuadreFunnelController] alerts error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  /**
   * GET /api/admin/dashboard/conversion-by-channel
   *
   * Returns conversion rates (SELECCIONADO / total) grouped by recruitment origin channel.
   */
  async getConversionByChannel(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT
          COALESCE(e.origen, 'Desconocido') AS channel,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE e.resultado = 'SELECCIONADO')::int AS selected,
          COUNT(*) FILTER (WHERE e.attended = true)::int AS attended,
          ROUND(
            COUNT(*) FILTER (WHERE e.resultado = 'SELECCIONADO')::numeric
            / NULLIF(COUNT(*) FILTER (WHERE e.attended = true), 0),
            3
          ) AS conversion_rate
        FROM encuadres e
        WHERE e.job_posting_id IS NOT NULL
        GROUP BY COALESCE(e.origen, 'Desconocido')
        ORDER BY total DESC
      `);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          channel: row.channel,
          total: row.total,
          selected: row.selected,
          attended: row.attended,
          conversionRate: row.conversion_rate ? parseFloat(row.conversion_rate) : null,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EncuadreFunnelController] conversion-by-channel error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }
}
