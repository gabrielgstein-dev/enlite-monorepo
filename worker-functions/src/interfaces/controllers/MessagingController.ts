import { Request, Response } from 'express';
import { Pool } from 'pg';
import { IMessagingService } from '../../domain/ports/IMessagingService';
import { MessageTemplateRepository } from '../../infrastructure/repositories/MessageTemplateRepository';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

export class MessagingController {
  private messaging: IMessagingService;
  private templateRepo: MessageTemplateRepository;
  private db: Pool;

  constructor(messaging: IMessagingService, templateRepo: MessageTemplateRepository) {
    this.messaging = messaging;
    this.templateRepo = templateRepo;
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * POST /api/admin/messaging/whatsapp
   * Envia mensagem WhatsApp para um worker pelo seu ID.
   *
   * Body:
   *   workerId: string
   *   templateSlug: string
   *   variables?: Record<string, string>
   *   jobPostingId?: string  — quando informado com template vacancy_match, atualiza messaged_at
   */
  async sendToWorker(req: Request, res: Response): Promise<void> {
    const { workerId, templateSlug, variables, jobPostingId } = req.body;

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

    // Rastreia envio de vacancy_match: atualiza messaged_at na candidatura correspondente
    if (templateSlug.trim() === 'vacancy_match' && jobPostingId) {
      await this.db.query(
        `UPDATE worker_job_applications
         SET messaged_at = NOW(), updated_at = NOW()
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [workerId, jobPostingId]
      ).catch(err => {
        console.warn(`[MessagingController] Falha ao atualizar messaged_at para worker=${workerId} job=${jobPostingId}:`, err.message);
      });
    }

    res.status(200).json(result.getValue());
  }

  /**
   * POST /api/admin/messaging/whatsapp/direct
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

  /**
   * GET /api/admin/messaging/templates
   * Lista templates. Query param ?all=true inclui inativos.
   */
  async listTemplates(req: Request, res: Response): Promise<void> {
    const onlyActive = req.query.all !== 'true';
    const templates = await this.templateRepo.findAll(onlyActive);
    res.status(200).json({ success: true, data: templates });
  }

  /**
   * POST /api/admin/messaging/templates
   * Cria ou atualiza template (upsert por slug).
   * Retorna 201 se criado, 200 se atualizado.
   *
   * Body: slug, name, body, category?
   */
  async createTemplate(req: Request, res: Response): Promise<void> {
    const { slug, name, body, category } = req.body;

    if (!slug || !name || !body) {
      res.status(400).json({ error: 'slug, name e body são obrigatórios' });
      return;
    }

    const { entity, created } = await this.templateRepo.upsert({ slug, name, body, category });
    res.status(created ? 201 : 200).json({ success: true, data: entity });
  }

  /**
   * PUT /api/admin/messaging/templates/:slug
   * Atualiza name, body e category de um template existente.
   * Preserva is_active atual (não reativa nem desativa).
   *
   * Body: name, body, category?, isActive?
   */
  async updateTemplate(req: Request, res: Response): Promise<void> {
    const { slug } = req.params;
    const { name, body, category, isActive } = req.body;

    if (!name || !body) {
      res.status(400).json({ error: 'name e body são obrigatórios' });
      return;
    }

    const { entity } = await this.templateRepo.upsert({ slug, name, body, category, isActive });
    res.status(200).json({ success: true, data: entity });
  }

  /**
   * DELETE /api/admin/messaging/templates/:slug
   * Desativa (soft delete) um template.
   */
  async deleteTemplate(req: Request, res: Response): Promise<void> {
    const { slug } = req.params;
    const found = await this.templateRepo.deactivate(slug);

    if (!found) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }

    res.status(200).json({ success: true });
  }
}
