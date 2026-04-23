import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { TalentumPrescreeningPayloadSchema } from '../validators/talentumPrescreeningSchema';
import { PartnerContext } from '../../../domain/entities/WebhookPartner';
import { VacancyCreatedHandler } from '../handlers/VacancyCreatedHandler';
import { PrescreeningResponseHandler } from '../handlers/PrescreeningResponseHandler';
import { TalentumWebhookContext } from '../handlers/TalentumWebhookHandler';

const TAG = '[TalentumWebhook]';

export class TalentumWebhookController {
  private readonly pool: Pool;
  private readonly vacancyHandler: VacancyCreatedHandler;
  private readonly prescreeningHandler: PrescreeningResponseHandler;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.vacancyHandler = new VacancyCreatedHandler(this.pool);
    this.prescreeningHandler = new PrescreeningResponseHandler(this.pool);
  }

  async handlePrescreening(req: Request, res: Response): Promise<void> {
    const action = req.body?.action ?? 'unknown';
    const subtype = req.body?.subtype ?? 'unknown';
    console.log(`${TAG} ── INCOMING ── action=${action} | subtype=${subtype}`);

    // ── Validate ────────────────────────────────────────────────────
    const parsed = TalentumPrescreeningPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`${TAG} VALIDATION FAILED |`, JSON.stringify(parsed.error.flatten().fieldErrors));
      res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      return;
    }

    // ── Build context ───────────────────────────────────────────────
    const partnerContext = (req as any).partnerContext as PartnerContext | undefined;
    const ctx: TalentumWebhookContext = {
      environment: partnerContext?.isTest ? 'test' : 'production',
      partnerId: partnerContext?.partnerId ?? null,
    };

    // ── Dispatch ────────────────────────────────────────────────────
    const payload = parsed.data;

    switch (payload.action) {
      case 'PRESCREENING':
        return this.vacancyHandler.handle(payload, ctx, res);

      case 'PRESCREENING_RESPONSE':
        return this.prescreeningHandler.handle(payload, ctx, res);

      // istanbul ignore next — unreachable after Zod discriminated union validation
      default:
        console.warn(`${TAG} unknown action: ${action}`);
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  }
}
