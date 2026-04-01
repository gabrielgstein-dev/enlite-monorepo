// =====================
// TalentumWebhookController — endpoint POST /api/webhooks/talentum/prescreening
//
// Autenticação: via PartnerAuthMiddleware (X-Partner-Key validada pelo Google API).
// Em ambiente de teste (USE_MOCK_AUTH=true) a validação é ignorada pelo middleware.
//
// O controller NÃO contém lógica de negócio — apenas:
//   1. Valida payload (Zod)
//   2. Lê partnerContext (injetado pelo middleware)
//   3. Executa use case
//   4. Retorna resultado
// =====================

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../../infrastructure/database/DatabaseConnection';
import { TalentumPrescreeningRepository } from '../../../infrastructure/repositories/TalentumPrescreeningRepository';
import { WorkerRepository } from '../../../infrastructure/repositories/WorkerRepository';
import { TalentumPrescreeningPayloadSchema } from '../validators/talentumPrescreeningSchema';
import {
  ProcessTalentumPrescreening,
  IJobPostingLookup,
} from '../../../application/usecases/ProcessTalentumPrescreening';
import { PartnerContext } from '../../../domain/entities/WebhookPartner';
import { PubSubClient } from '../../../infrastructure/events/PubSubClient';

// ─────────────────────────────────────────────────────────────────
// JobPostingLookup — implementação concreta da porta IJobPostingLookup
// ─────────────────────────────────────────────────────────────────
class JobPostingLookup implements IJobPostingLookup {
  constructor(private readonly pool: Pool) {}

  async findByTitleILike(name: string): Promise<{ id: string } | null> {
    const result = await this.pool.query(
      `SELECT id FROM job_postings WHERE title ILIKE $1 AND deleted_at IS NULL LIMIT 1`,
      [`%${name}%`],
    );
    return result.rows[0] ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────
// TalentumWebhookController
// ─────────────────────────────────────────────────────────────────
export class TalentumWebhookController {
  // POST /api/webhooks/talentum/prescreening
  async handlePrescreening(req: Request, res: Response): Promise<void> {
    // ── 1. Validar payload com Zod ───────────────────────────────────
    const parsed = TalentumPrescreeningPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
      return;
    }

    // ── 2. Ler partnerContext (injetado pelo PartnerAuthMiddleware) ───
    const partnerContext = (req as any).partnerContext as PartnerContext | undefined;
    const environment = partnerContext?.isTest ? 'test' : 'production';

    // ── 3. Instanciar dependências e executar use case ───────────────
    try {
      const pool = DatabaseConnection.getInstance().getPool();
      const prescreeningRepo = new TalentumPrescreeningRepository();
      const workerLookup     = new WorkerRepository();
      const jobPostingLookup = new JobPostingLookup(pool);
      const pubsub           = new PubSubClient();

      const useCase = new ProcessTalentumPrescreening(
        prescreeningRepo,
        workerLookup,
        jobPostingLookup,
        pool,
        pubsub,
      );

      const result = await useCase.execute(parsed.data, { environment, dryRun: false });

      res.status(200).json(result);
    } catch (err) {
      // Log apenas ID interno — nunca expor PII ou stack trace na resposta
      console.error('[TalentumWebhook] DB error | prescreeningId (ext):', req.body?.prescreening?.id ?? 'unknown', '| cause:', (err as Error)?.message ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
