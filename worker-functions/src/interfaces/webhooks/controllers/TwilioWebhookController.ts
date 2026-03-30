import { Request, Response } from 'express';
import twilio from 'twilio';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../../infrastructure/database/DatabaseConnection';

/**
 * Controller que recebe status callbacks do Twilio.
 *
 * O Twilio envia POST application/x-www-form-urlencoded quando o status
 * de uma mensagem WhatsApp muda (queued → sent → delivered / failed).
 *
 * Sem autenticação via partner key — validado via X-Twilio-Signature.
 * Sempre responde 200 para evitar retentativas do Twilio em caso de erro de DB.
 */
export class TwilioWebhookController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  async handleStatusCallback(req: Request, res: Response): Promise<void> {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const callbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;

    // Valida assinatura Twilio para garantir autenticidade do callback.
    // Se TWILIO_STATUS_CALLBACK_URL não estiver configurado, pular validação.
    if (callbackUrl && authToken) {
      const signature = req.headers['x-twilio-signature'] as string | undefined;

      if (!signature) {
        console.warn('[TwilioWebhook] Requisição sem X-Twilio-Signature — rejeitada');
        res.status(403).end();
        return;
      }

      const isValid = twilio.validateRequest(authToken, signature, callbackUrl, req.body as Record<string, string>);

      if (!isValid) {
        console.warn('[TwilioWebhook] Assinatura inválida — rejeitada');
        res.status(403).end();
        return;
      }
    } else {
      console.warn('[TwilioWebhook] TWILIO_STATUS_CALLBACK_URL não configurado — validação de assinatura ignorada');
    }

    const body = req.body as Record<string, string>;
    const messageSid = body['MessageSid'];
    const messageStatus = body['MessageStatus'];

    if (!messageSid || !messageStatus) {
      console.warn('[TwilioWebhook] Payload inválido: MessageSid ou MessageStatus ausente');
      res.status(200).end();
      return;
    }

    console.log(`[TwilioWebhook] SID=${messageSid} status=${messageStatus}`);

    try {
      await this.db.query(
        `UPDATE whatsapp_bulk_dispatch_logs
         SET delivery_status = $1
         WHERE twilio_sid = $2`,
        [messageStatus, messageSid],
      );
    } catch (err) {
      console.error('[TwilioWebhook] Erro ao atualizar whatsapp_bulk_dispatch_logs:', err);
    }

    try {
      await this.db.query(
        `UPDATE messaging_outbox
         SET delivery_status = $1
         WHERE twilio_sid = $2`,
        [messageStatus, messageSid],
      );
    } catch (err) {
      console.error('[TwilioWebhook] Erro ao atualizar messaging_outbox:', err);
    }

    // Twilio não usa o body da resposta — apenas o status code importa.
    res.status(200).end();
  }
}
