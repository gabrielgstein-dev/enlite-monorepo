import { Request, Response } from 'express';
import { Pool } from 'pg';
import twilio from 'twilio';
import { BookSlotFromWhatsAppUseCase } from '../../../application/use-cases/BookSlotFromWhatsAppUseCase';
import { HandleReminderResponseUseCase } from '../../../application/use-cases/HandleReminderResponseUseCase';

/** Templates do fluxo qualified interview que este controller sabe rotear */
const INTERVIEW_INVITE_SLUG = 'qualified_worker';
const LEGACY_INVITE_SLUG = 'qualified_interview_invite';
const SLOT_CONFIRMED_SLUG = 'qualified_slot_confirmed';
const REMINDER_CONFIRM_SLUG = 'qualified_reminder_confirm';

const INTERVIEW_SLUGS = new Set([
  INTERVIEW_INVITE_SLUG,
  LEGACY_INVITE_SLUG,
  SLOT_CONFIRMED_SLUG,
  REMINDER_CONFIRM_SLUG,
]);

/**
 * Controller para mensagens inbound do WhatsApp via Twilio.
 *
 * Recebe POST application/x-www-form-urlencoded quando o worker
 * toca num botão interativo (quick-reply).
 *
 * Roteamento em dois passos:
 *   1. OriginalRepliedMessageSid → lookup na messaging_outbox → template_slug
 *   2. template_slug + ButtonPayload determinam o use case correto
 *
 * Se o template_slug não pertence ao fluxo de entrevista, a mensagem é ignorada.
 * Sempre responde 200 para evitar retentativas do Twilio.
 */
export class InboundWhatsAppController {
  constructor(
    private readonly db: Pool,
    private readonly bookSlotUseCase: BookSlotFromWhatsAppUseCase,
    private readonly handleReminderResponseUseCase: HandleReminderResponseUseCase,
  ) {}

  async handleInbound(req: Request, res: Response): Promise<void> {
    // 1. Validar assinatura Twilio
    if (!this.validateTwilioSignature(req)) {
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const body = req.body as Record<string, string>;
    const from = body['From'] ?? '';
    const buttonPayload = body['ButtonPayload'] ?? '';
    const originalMessageSid = body['OriginalRepliedMessageSid'] ?? '';

    if (!buttonPayload) {
      console.info('[InboundWhatsApp] Message ignored (no ButtonPayload)', { from });
      res.status(200).send();
      return;
    }

    // 2. Identificar template_slug via OriginalRepliedMessageSid + rotear
    try {
      let templateSlug: string | null = null;

      if (originalMessageSid) {
        const outboxResult = await this.db.query<{ template_slug: string }>(
          `SELECT template_slug FROM messaging_outbox WHERE twilio_sid = $1 LIMIT 1`,
          [originalMessageSid],
        );
        templateSlug = outboxResult.rows[0]?.template_slug ?? null;
      }

      // 3. Rotear por template_slug + ButtonPayload
      if (templateSlug && !INTERVIEW_SLUGS.has(templateSlug)) {
        // Mensagem de outro fluxo (ex: client_selection) — não é nossa
        console.info('[InboundWhatsApp] Message ignored (template not interview flow)', {
          from, templateSlug, buttonPayload,
        });
      } else if ((templateSlug === INTERVIEW_INVITE_SLUG || templateSlug === LEGACY_INVITE_SLUG) && buttonPayload.startsWith('slot_')) {
        // Resposta ao convite de entrevista: worker escolheu horário
        const result = await this.bookSlotUseCase.execute(from, buttonPayload, originalMessageSid);
        if (result.isFailure) {
          console.warn(`[InboundWhatsApp] BookSlot failed: ${result.error}`);
        }
      } else if (templateSlug === REMINDER_CONFIRM_SLUG && buttonPayload.startsWith('confirm_')) {
        // Resposta ao reminder de 24h: worker confirmou ou declinou
        const result = await this.handleReminderResponseUseCase.execute(from, buttonPayload, originalMessageSid);
        if (result.isFailure) {
          console.warn(`[InboundWhatsApp] ReminderResponse failed: ${result.error}`);
        }
      } else if (!templateSlug) {
        // OriginalRepliedMessageSid ausente ou não encontrado na outbox
        // Fallback: rotear pelo prefixo do ButtonPayload (compatibilidade / janela 7 dias)
        if (buttonPayload.startsWith('slot_')) {
          const result = await this.bookSlotUseCase.execute(from, buttonPayload, originalMessageSid);
          if (result.isFailure) {
            console.warn(`[InboundWhatsApp] BookSlot (fallback) failed: ${result.error}`);
          }
        } else if (buttonPayload.startsWith('confirm_')) {
          const result = await this.handleReminderResponseUseCase.execute(from, buttonPayload, originalMessageSid);
          if (result.isFailure) {
            console.warn(`[InboundWhatsApp] ReminderResponse (fallback) failed: ${result.error}`);
          }
        } else {
          console.info('[InboundWhatsApp] Message ignored (unrecognized payload)', { from, buttonPayload });
        }
      } else {
        console.info('[InboundWhatsApp] Message ignored (template/payload mismatch)', {
          from, templateSlug, buttonPayload,
        });
      }
    } catch (err) {
      console.error('[InboundWhatsApp] Unexpected error:', err);
    }

    // 4. Twilio espera 200 OK
    res.status(200).send();
  }

  /**
   * Valida X-Twilio-Signature (HMAC).
   * Se TWILIO_INBOUND_WEBHOOK_URL não configurado, pula validação (dev/test).
   */
  private validateTwilioSignature(req: Request): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const webhookUrl = process.env.TWILIO_INBOUND_WEBHOOK_URL;

    if (!webhookUrl || !authToken) {
      console.warn('[InboundWhatsApp] TWILIO_INBOUND_WEBHOOK_URL not set — signature validation skipped');
      return true;
    }

    const signature = req.headers['x-twilio-signature'] as string | undefined;
    if (!signature) {
      return false;
    }

    return twilio.validateRequest(
      authToken,
      signature,
      webhookUrl,
      req.body as Record<string, string>,
    );
  }
}
