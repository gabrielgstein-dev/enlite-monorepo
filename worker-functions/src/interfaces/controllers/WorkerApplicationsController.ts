import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { GetWorkerProgressUseCase } from '../../application/use-cases/GetWorkerProgressUseCase';
import { WorkerRepository } from '../../infrastructure/repositories/WorkerRepository';

const VALID_CHANNELS = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'site'] as const;

const TrackChannelSchema = z.object({
  jobPostingId: z.string().min(1, 'jobPostingId is required'),
  channel: z.enum(VALID_CHANNELS, {
    errorMap: () => ({
      message: `channel must be one of: ${VALID_CHANNELS.join(', ')}`,
    }),
  }),
});

/**
 * WorkerApplicationsController
 *
 * Endpoints for worker-facing job application actions.
 *
 * - POST /api/worker-applications/track-channel
 *     Records the social acquisition channel for a WJA (first-touch wins).
 *     Auth: requireAuth (worker token)
 */
export class WorkerApplicationsController {
  private readonly db: Pool;
  private readonly getProgressUseCase: GetWorkerProgressUseCase;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.getProgressUseCase = new GetWorkerProgressUseCase(new WorkerRepository());
  }

  private getAuthUid(req: Request): string | null {
    return (req as Request & { user?: { uid: string } }).user?.uid
      ?? (req.headers['x-auth-uid'] as string | undefined)
      ?? null;
  }

  private async resolveWorkerId(authUid: string): Promise<string | null> {
    const result = await this.getProgressUseCase.execute(authUid);
    if (result.isFailure) return null;
    return (result.getValue() as { id: string }).id;
  }

  /**
   * POST /api/worker-applications/track-channel
   *
   * Body: { jobPostingId: string, channel: 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'site' }
   *
   * First-touch wins: if acquisition_channel already has a value, does NOT overwrite.
   * If no WJA exists, creates one with source='manual' and the given channel.
   */
  async trackChannel(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const parsed = TrackChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? 'Invalid request body',
        });
        return;
      }

      const { jobPostingId, channel } = parsed.data;

      const workerId = await this.resolveWorkerId(authUid);
      if (!workerId) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }

      // Upsert WJA with first-touch semantics:
      // - INSERT: sets acquisition_channel, source='manual', funnel_stage=NULL (INVITED)
      //   NOTE: application_funnel_stage has DEFAULT 'INITIATED' (migration 097),
      //   so we must explicitly set NULL to land in the INVITED column.
      // - ON CONFLICT: sets acquisition_channel only when it is currently NULL
      await this.db.query(
        `INSERT INTO worker_job_applications
           (worker_id, job_posting_id, application_status, source, acquisition_channel, application_funnel_stage)
         VALUES ($1, $2, 'applied', 'manual', $3, NULL)
         ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET
           acquisition_channel = CASE
             WHEN worker_job_applications.acquisition_channel IS NULL THEN EXCLUDED.acquisition_channel
             ELSE worker_job_applications.acquisition_channel
           END,
           updated_at = NOW()`,
        [workerId, jobPostingId, channel],
      );

      // Ensure encuadre exists so the worker appears in the Kanban INVITED column.
      // Only creates if no encuadre exists for this worker+job_posting (preserves Talentum encuadres).
      const dedupHash = crypto.createHash('md5')
        .update(`social-link|${workerId}|${jobPostingId}`)
        .digest('hex');

      await this.db.query(
        `INSERT INTO encuadres (worker_id, job_posting_id, worker_raw_name, worker_raw_phone, origen, dedup_hash)
         SELECT $1, $2, w.email, w.phone, $4, $3
         FROM workers w
         WHERE w.id = $1
           AND NOT EXISTS (
             SELECT 1 FROM encuadres e WHERE e.worker_id = $1 AND e.job_posting_id = $2
           )
         ON CONFLICT (dedup_hash) DO NOTHING`,
        [workerId, jobPostingId, dedupHash, channel],
      );

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[WorkerApplicationsController] trackChannel error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }
}
