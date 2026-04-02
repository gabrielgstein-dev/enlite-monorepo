import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';


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
           wja.application_funnel_stage AS funnel_stage,
           CASE WHEN wja.source = 'talentum' THEN wja.application_funnel_stage ELSE NULL END AS talentum_status,
           wl.work_zone
         FROM encuadres e
         LEFT JOIN workers w ON w.id = e.worker_id
         LEFT JOIN worker_job_applications wja
           ON wja.worker_id = e.worker_id AND wja.job_posting_id = e.job_posting_id
         LEFT JOIN worker_locations wl ON wl.worker_id = e.worker_id
         WHERE e.job_posting_id = $1
         ORDER BY wja.updated_at DESC NULLS LAST, e.created_at DESC`,
        [id]
      );

      // Colunas do Kanban — classificação 100% baseada em application_funnel_stage
      const stages: Record<string, unknown[]> = {
        INVITED: [],
        INITIATED: [],
        IN_PROGRESS: [],
        COMPLETED: [],     // agrupa COMPLETED + QUALIFIED + IN_DOUBT + NOT_QUALIFIED (tag diferencia)
        CONFIRMED: [],
        SELECTED: [],
        REJECTED: [],
      };

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

        const stage = row.funnel_stage;

        // Classificação direta por application_funnel_stage
        if (stage === 'SELECTED' || stage === 'PLACED') {
          stages.SELECTED.push(item);
        } else if (stage === 'REJECTED') {
          stages.REJECTED.push(item);
        } else if (stage === 'CONFIRMED') {
          stages.CONFIRMED.push(item);
        } else if (['COMPLETED', 'QUALIFIED', 'IN_DOUBT', 'NOT_QUALIFIED'].includes(stage)) {
          stages.COMPLETED.push(item);
        } else if (stage === 'IN_PROGRESS') {
          stages.IN_PROGRESS.push(item);
        } else if (stage === 'INITIATED') {
          stages.INITIATED.push(item);
        } else {
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
   * Moves encuadre to a new Kanban column by updating application_funnel_stage.
   * Also syncs encuadre.resultado for terminal states (SELECTED/REJECTED).
   *
   * Body: { targetStage, rejectionReasonCategory?, rejectionReason? }
   */
  async moveEncuadre(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { targetStage, rejectionReasonCategory, rejectionReason } = req.body;

      const validStages = [
        'INITIATED', 'IN_PROGRESS', 'COMPLETED', 'QUALIFIED', 'IN_DOUBT',
        'NOT_QUALIFIED', 'CONFIRMED', 'SELECTED', 'REJECTED',
      ];

      if (!targetStage || !validStages.includes(targetStage)) {
        res.status(400).json({ success: false, error: `targetStage must be one of: ${validStages.join(', ')}` });
        return;
      }

      // 1. Busca encuadre para obter worker_id + job_posting_id
      const encuadre = await this.db.query(
        `SELECT worker_id, job_posting_id FROM encuadres WHERE id = $1`,
        [id],
      );
      if (encuadre.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Encuadre not found' });
        return;
      }

      const { worker_id: workerId, job_posting_id: jobPostingId } = encuadre.rows[0];
      if (!workerId || !jobPostingId) {
        res.status(400).json({ success: false, error: 'Encuadre has no linked worker or job posting' });
        return;
      }

      // 2. Atualizar application_funnel_stage (fonte de verdade)
      await this.db.query(
        `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage, application_status, source)
         VALUES ($1, $2, $3, 'applied', 'manual')
         ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET
           application_funnel_stage = $3,
           updated_at = NOW()`,
        [workerId, jobPostingId, targetStage],
      );

      // 3. Sincronizar encuadre.resultado para estados terminais
      if (targetStage === 'SELECTED') {
        await this.db.query(
          `UPDATE encuadres SET resultado = 'SELECCIONADO', updated_at = NOW() WHERE id = $1`,
          [id],
        );
      } else if (targetStage === 'REJECTED') {
        await this.db.query(
          `UPDATE encuadres SET resultado = 'RECHAZADO',
             rejection_reason_category = COALESCE($2, rejection_reason_category),
             rejection_reason = COALESCE($3, rejection_reason),
             updated_at = NOW()
           WHERE id = $1`,
          [id, rejectionReasonCategory ?? null, rejectionReason ?? null],
        );
      }

      res.json({ success: true, data: { encuadreId: id, targetStage } });
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
