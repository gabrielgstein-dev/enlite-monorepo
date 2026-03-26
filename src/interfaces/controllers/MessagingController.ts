import { Request, Response } from 'express';
import { Pool } from 'pg';
import { IMessagingService } from '../../domain/ports/IMessagingService';
import { MessageTemplateRepository } from '../../infrastructure/repositories/MessageTemplateRepository';
import { TwilioMessagingService } from '../../infrastructure/services/TwilioMessagingService';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

// TODO (Phase 5): receber IMessagingService via injeção no construtor.
export class MessagingController {
  private messaging: IMessagingService;
  private db: Pool;

  constructor() {
    const templateRepo = new MessageTemplateRepository();
    this.messaging = new TwilioMessagingService(templateRepo);
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * POST /api/messaging/whatsapp
   * Envia mensagem WhatsApp para um worker pelo seu ID.
   *
   * Body:
   *   workerId: string
   *   templateSlug: string
   *   variables?: Record<string, string>
   */
  async sendToWorker(req: Request, res: Response): Promise<void> {
    const { workerId, templateSlug, variables } = req.body;

    if (!workerId || !templateSlug) {
      res.status(400).json({ error: 'workerId e templateSlug são obrigatórios' });
      return;
    }

    if (typeof templateSlug !== 'string' || templateSlug.trim().length === 0) {
      res.status(400).json({ error: 'templateSlug não pode ser vazio' });
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

    const result = await this.messaging.sendWhatsApp({ to, templateSlug: templateSlug.trim(), variables });

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
   *   templateSlug: string
   *   variables?: Record<string, string>
   */
  async sendDirect(req: Request, res: Response): Promise<void> {
    const { to, templateSlug, variables } = req.body;

    if (!to || !templateSlug) {
      res.status(400).json({ error: 'to e templateSlug são obrigatórios' });
      return;
    }

    if (typeof templateSlug !== 'string' || templateSlug.trim().length === 0) {
      res.status(400).json({ error: 'templateSlug não pode ser vazio' });
      return;
    }

    const result = await this.messaging.sendWhatsApp({ to, templateSlug: templateSlug.trim(), variables });

    if (result.isFailure) {
      res.status(502).json({ error: result.error });
      return;
    }

    res.status(200).json(result.getValue());
  }
}
