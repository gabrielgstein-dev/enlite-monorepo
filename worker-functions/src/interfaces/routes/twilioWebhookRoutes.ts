import { Router } from 'express';
import { TwilioWebhookController } from '../controllers/TwilioWebhookController';

const router = Router();
const controller = new TwilioWebhookController();

// POST /api/webhooks/twilio/status
// Chamado pelo Twilio quando o status de uma mensagem WhatsApp muda.
// Sem autenticação Firebase — validado via X-Twilio-Signature.
router.post('/status', (req, res) => controller.handleStatusCallback(req, res));

export default router;
