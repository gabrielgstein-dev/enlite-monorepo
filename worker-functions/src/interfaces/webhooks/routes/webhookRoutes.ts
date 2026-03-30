import { Router, Request, Response } from 'express';
import { PartnerAuthMiddleware } from '../middleware/PartnerAuthMiddleware';
import { TalentumWebhookController } from '../controllers/TalentumWebhookController';
import { TwilioWebhookController } from '../controllers/TwilioWebhookController';

/**
 * Cria o router unificado de webhooks.
 * Reutilizado tanto para /api/webhooks/ (produção) quanto /api/webhooks-test/ (teste).
 * O PartnerAuthMiddleware determina isTest com base no prefixo da URL.
 */
export function createWebhookRoutes(partnerAuth: PartnerAuthMiddleware): Router {
  const router = Router();
  const talentumController = new TalentumWebhookController();
  const twilioController = new TwilioWebhookController();

  // ── Talentum — autenticado via partner key (X-Partner-Key) ──────
  router.post(
    '/talentum/prescreening',
    partnerAuth.requirePartnerKey(),
    (req: Request, res: Response) => talentumController.handlePrescreening(req, res),
  );

  // ── Twilio — auth próprio via X-Twilio-Signature (sem partner key) ──
  router.post(
    '/twilio/status',
    (req: Request, res: Response) => twilioController.handleStatusCallback(req, res),
  );

  return router;
}
