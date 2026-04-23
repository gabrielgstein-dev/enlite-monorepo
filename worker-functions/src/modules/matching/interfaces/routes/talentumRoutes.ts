import { Router } from 'express';
import { TalentumWebhookController } from '../controllers/TalentumWebhookController';

const router = Router();
const controller = new TalentumWebhookController();

// POST /api/webhooks/talentum/prescreening
// Chamado pelo n8n via Service Account. Sem Firebase auth.
// Autenticação: Google ID Token (Authorization: Bearer <id_token>).
router.post(
  '/prescreening',
  (req, res) => controller.handlePrescreening(req, res),
);

export default router;
