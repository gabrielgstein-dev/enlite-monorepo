import { Request, Response } from 'express';
import { Pool } from 'pg';
import { TwilioMessagingService } from '../../infrastructure/services/TwilioMessagingService';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

export class MessagingController {
  private messaging: TwilioMessagingService;
  private db: Pool;

  constructor() {
    this.messaging = new TwilioMessagingService();
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * POST /api/messaging/whatsapp
   * Envia mensagem WhatsApp para um worker pelo seu ID.
   *
   * Body:
   *   workerId: string
   *   message: string
   */
  async sendToWorker(req: Request, res: Response): Promise<void> {
    const { workerId, message } = req.body;

    if (!workerId || !message) {
      res.status(400).json({ error: 'workerId e message são obrigatórios' });
      return;
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'message não pode ser vazia' });
      return;
    }

    const workerResult = await this.db.query<{ whatsapp_phone: string | null; phone: string | null }>(
      `SELECT whatsapp_phone, phone FROM workers WHERE id = $1 LIMIT 1`,
      [workerId]
    );

    if (workerResult.rows.length === 0) {
      res.status(404).json({ error: 'Worker não encontrado' });
      return;
    }

    const { whatsapp_phone, phone } = workerResult.rows[0];
    const to = whatsapp_phone || phone;

    if (!to) {
      res.status(422).json({ error: 'Worker não possui número de telefone cadastrado' });
      return;
    }

    const result = await this.messaging.sendWhatsApp({ to, body: message.trim() });

    if (result.isFailure) {
      res.status(502).json({ error: result.error });
      return;
    }

    res.status(200).json(result.getValue());
  }

  /**
   * POST /api/messaging/whatsapp/direct
   * Envia mensagem WhatsApp diretamente para um número (uso interno/admin).
   *
   * Body:
   *   to: string  — número em formato E.164 ou local
   *   message: string
   */
  async sendDirect(req: Request, res: Response): Promise<void> {
    const { to, message } = req.body;

    if (!to || !message) {
      res.status(400).json({ error: 'to e message são obrigatórios' });
      return;
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'message não pode ser vazia' });
      return;
    }

    const result = await this.messaging.sendWhatsApp({ to, body: message.trim() });

    if (result.isFailure) {
      res.status(502).json({ error: result.error });
      return;
    }

    res.status(200).json(result.getValue());
  }
}
