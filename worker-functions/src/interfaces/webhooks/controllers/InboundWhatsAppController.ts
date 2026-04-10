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
  /** Cache: contentSid → array de { id, title } dos botões quick-reply */
  private readonly contentActionsCache = new Map<string, { id: string; title: string }[]>();

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
    let buttonPayload = body['ButtonPayload'] ?? '';
    const originalMessageSid = body['OriginalRepliedMessageSid'] ?? '';

    // Fallback: se ButtonPayload vazio, tentar inferir a partir do Body
    // usando o template original (via Twilio Content API) para mapear
    // título do botão → id do botão. Funciona para qualquer template.
    if (!buttonPayload) {
      const bodyText = (body['Body'] ?? '').trim();
      buttonPayload = await this.inferButtonPayloadFromBody(bodyText, originalMessageSid);
    }

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
   * Infere o ButtonPayload a partir do texto do Body consultando o template
   * original via Twilio Content API.
   *
   * Fluxo:
   *   1. OriginalRepliedMessageSid → messaging_outbox.template_slug
   *   2. template_slug → message_templates.content_sid
   *   3. content_sid → Twilio Content API → actions[].title
   *   4. Body text match contra titles → retorna action.id
   *
   * Funciona para qualquer template com qualquer texto de botão.
   */
  private async inferButtonPayloadFromBody(
    bodyText: string,
    originalMessageSid: string,
  ): Promise<string> {
    if (!bodyText || !originalMessageSid) return '';

    try {
      // 1. Template slug da mensagem original
      const outboxResult = await this.db.query<{ template_slug: string }>(
        `SELECT template_slug FROM messaging_outbox WHERE twilio_sid = $1 LIMIT 1`,
        [originalMessageSid],
      );
      const slug = outboxResult.rows[0]?.template_slug;
      if (!slug) return '';

      // 2. Content SID do template
      const templateResult = await this.db.query<{ content_sid: string | null }>(
        `SELECT content_sid FROM message_templates WHERE slug = $1 AND is_active = true LIMIT 1`,
        [slug],
      );
      const contentSid = templateResult.rows[0]?.content_sid;
      if (!contentSid) return '';

      // 3. Buscar ações do template (cache in-memory)
      const actions = await this.getContentActions(contentSid);

      // 4. Match case-insensitive do Body contra títulos dos botões
      const normalized = bodyText.toLowerCase();
      const match = actions.find(a => a.title.toLowerCase() === normalized);

      if (match) {
        console.info('[InboundWhatsApp] Inferred ButtonPayload from Body via Content API', {
          bodyText, contentSid, buttonPayload: match.id,
        });
        return match.id;
      }
    } catch (err) {
      console.warn('[InboundWhatsApp] inferButtonPayloadFromBody error:', err);
    }

    return '';
  }

  /**
   * Busca as ações quick-reply de um Content Template no Twilio Content API.
   * Resultado é cacheado em memória (templates raramente mudam).
   */
  private async getContentActions(contentSid: string): Promise<{ id: string; title: string }[]> {
    const cached = this.contentActionsCache.get(contentSid);
    if (cached) return cached;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return [];

    const response = await fetch(
      `https://content.twilio.com/v1/Content/${contentSid}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
      },
    );

    if (!response.ok) {
      console.warn(`[InboundWhatsApp] Content API fetch failed: ${response.status} for ${contentSid}`);
      return [];
    }

    const data = (await response.json()) as Record<string, unknown>;
    const types = data.types as Record<string, { actions?: { id: string; title: string }[] }> | undefined;
    const quickReply = types?.['twilio/quick-reply'];
    const actions = quickReply?.actions ?? [];

    this.contentActionsCache.set(contentSid, actions);
    return actions;
  }

  /**
   * Valida X-Twilio-Signature (HMAC).
   * Se TWILIO_INBOUND_WEBHOOK_URL não configurado, pula validação (dev/test).
   * Requests via Studio Flow (JSON) chegam sem X-Twilio-Signature — aceitos
   * porque o Studio Flow é interno ao Twilio e já autenticou a mensagem original.
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
      // Studio Flow make-http-request não envia X-Twilio-Signature.
      // Aceitar se o AccountSid no body corresponde ao nosso (prova que veio do Twilio).
      const bodySid = (req.body as Record<string, string>)?.['AccountSid'];
      if (bodySid && bodySid === process.env.TWILIO_ACCOUNT_SID) {
        return true;
      }
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
