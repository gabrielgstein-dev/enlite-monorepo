import { Request, Response } from 'express';
import { InboundWhatsAppController } from '../InboundWhatsAppController';
import { Result } from '../../../../domain/shared/Result';

// Mock twilio.validateRequest
jest.mock('twilio', () => ({
  __esModule: true,
  default: {
    validateRequest: jest.fn().mockReturnValue(true),
  },
}));

import twilio from 'twilio';
const mockValidateRequest = twilio.validateRequest as jest.Mock;

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function mockReq(body: Record<string, string>, headers: Record<string, string> = {}): Request {
  return {
    body,
    headers: { 'x-twilio-signature': 'valid-sig', ...headers },
  } as unknown as Request;
}

describe('InboundWhatsAppController', () => {
  let mockBookSlot: { execute: jest.Mock };
  let mockHandleReminder: { execute: jest.Mock };
  let controller: InboundWhatsAppController;

  beforeEach(() => {
    mockBookSlot = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockHandleReminder = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    controller = new InboundWhatsAppController(mockBookSlot as any, mockHandleReminder as any);
    mockValidateRequest.mockReturnValue(true);

    // Habilitar validação de assinatura
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    process.env.TWILIO_INBOUND_WEBHOOK_URL = 'https://test.com/api/webhooks/twilio/inbound';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_INBOUND_WEBHOOK_URL;
  });

  // ─── Signature validation ─────────────────────────────────────

  it('rejeita com 403 se assinatura Twilio inválida', async () => {
    mockValidateRequest.mockReturnValue(false);

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBookSlot.execute).not.toHaveBeenCalled();
  });

  it('rejeita com 403 se X-Twilio-Signature ausente', async () => {
    const req = mockReq(
      { From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' },
      { 'x-twilio-signature': '' },
    );
    // Ensure the header is undefined for the test
    delete (req.headers as Record<string, string | undefined>)['x-twilio-signature'];
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ─── Routing ───────────────────────────────────────────────────

  it('roteia slot_* para BookSlotFromWhatsAppUseCase', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_2' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'slot_2');
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalled();
  });

  it('roteia confirm_* para HandleReminderResponseUseCase', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'confirm_yes' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockHandleReminder.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'confirm_yes');
    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignora mensagens sem ButtonPayload reconhecido', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', Body: 'Hola!' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('responde 200 mesmo se use case falhar', async () => {
    mockBookSlot.execute.mockResolvedValue(Result.fail('Worker not found'));

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('responde 200 mesmo se use case lançar exceção', async () => {
    mockBookSlot.execute.mockRejectedValue(new Error('DB connection lost'));

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ─── Validation skipped in dev ─────────────────────────────────

  it('responde 200 e loga warning se handleReminderResponse falhar', async () => {
    mockHandleReminder.execute.mockResolvedValue(Result.fail('Worker not found'));

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'confirm_no' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('trata body sem From e ButtonPayload (nullish coalesce)', async () => {
    const req = mockReq({});
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('pula validação se TWILIO_INBOUND_WEBHOOK_URL não configurado', async () => {
    delete process.env.TWILIO_INBOUND_WEBHOOK_URL;
    mockValidateRequest.mockReturnValue(false); // Não deve ser chamado

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBookSlot.execute).toHaveBeenCalled();
  });
});
