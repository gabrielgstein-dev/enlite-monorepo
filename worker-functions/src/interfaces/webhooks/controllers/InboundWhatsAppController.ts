import { Request, Response } from 'express';
import twilio from 'twilio';
import { BookSlotFromWhatsAppUseCase } from '../../../application/use-cases/BookSlotFromWhatsAppUseCase';
import { HandleReminderResponseUseCase } from '../../../application/use-cases/HandleReminderResponseUseCase';

/**
 * Controller para mensagens inbound do WhatsApp via Twilio.
 *
 * Recebe POST application/x-www-form-urlencoded quando o worker
 * toca num botão interativo (quick-reply).
 *
 * Roteamento por prefixo do ButtonPayload:
 *   - slot_*    → BookSlotFromWhatsAppUseCase (escolha de horário)
 *   - confirm_* → HandleReminderResponseUseCase (confirmação/declínio)
 *
 * Sempre responde 200 para evitar retentativas do Twilio.
 */
export class InboundWhatsAppController {
  constructor(
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

    // 2. Rotear por tipo de resposta
    try {
      if (buttonPayload.startsWith('slot_')) {
        const result = await this.bookSlotUseCase.execute(from, buttonPayload);
        if (result.isFailure) {
          console.warn(`[InboundWhatsApp] BookSlot failed: ${result.error}`);
        }
      } else if (buttonPayload.startsWith('confirm_')) {
        const result = await this.handleReminderResponseUseCase.execute(from, buttonPayload);
        if (result.isFailure) {
          console.warn(`[InboundWhatsApp] ReminderResponse failed: ${result.error}`);
        }
      } else {
        console.info('[InboundWhatsApp] Message ignored (not a button response)', { from });
      }
    } catch (err) {
      console.error('[InboundWhatsApp] Unexpected error:', err);
    }

    // 3. Twilio espera 200 OK
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
