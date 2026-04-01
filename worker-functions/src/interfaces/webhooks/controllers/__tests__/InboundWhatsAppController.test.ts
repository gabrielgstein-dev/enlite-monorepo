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
  let mockDbQuery: jest.Mock;
  let mockDb: { query: jest.Mock };
  let mockBookSlot: { execute: jest.Mock };
  let mockHandleReminder: { execute: jest.Mock };
  let controller: InboundWhatsAppController;

  beforeEach(() => {
    mockDbQuery = jest.fn();
    mockDb = { query: mockDbQuery };
    mockBookSlot = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockHandleReminder = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    controller = new InboundWhatsAppController(mockDb as any, mockBookSlot as any, mockHandleReminder as any);
    mockValidateRequest.mockReturnValue(true);

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
    delete (req.headers as Record<string, string | undefined>)['x-twilio-signature'];
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ─── Roteamento por template_slug + payload ────────────────────

  it('roteia slot_* para BookSlot quando template é qualified_interview_invite', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ template_slug: 'qualified_interview_invite' }] });

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'slot_2',
      OriginalRepliedMessageSid: 'SM-abc123',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('twilio_sid'),
      ['SM-abc123'],
    );
    expect(mockBookSlot.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'slot_2', 'SM-abc123');
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('roteia confirm_* para HandleReminder quando template é qualified_reminder_confirm', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ template_slug: 'qualified_reminder_confirm' }] });

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'confirm_yes',
      OriginalRepliedMessageSid: 'SM-def456',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockHandleReminder.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'confirm_yes', 'SM-def456');
    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ─── Ignora mensagens de outros fluxos ─────────────────────────

  it('ignora mensagem se template_slug não pertence ao fluxo de entrevista', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ template_slug: 'client_selection' }] });

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'slot_1',
      OriginalRepliedMessageSid: 'SM-other',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignora se template é interview mas payload não combina (template/payload mismatch)', async () => {
    // Template de invite mas payload de confirm
    mockDbQuery.mockResolvedValueOnce({ rows: [{ template_slug: 'qualified_interview_invite' }] });

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'confirm_yes',
      OriginalRepliedMessageSid: 'SM-mismatch',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ─── Fallback sem OriginalRepliedMessageSid ─────────────────────

  it('usa fallback por prefixo do payload se OriginalRepliedMessageSid ausente', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    // Não fez lookup na outbox (sem SID)
    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockBookSlot.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'slot_1', '');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('usa fallback confirm_* se OriginalRepliedMessageSid ausente', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'confirm_no' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'confirm_no', '');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('usa fallback se SID presente mas outbox não encontra', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'slot_1',
      OriginalRepliedMessageSid: 'SM-unknown',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).toHaveBeenCalledWith('whatsapp:+5491112345678', 'slot_1', 'SM-unknown');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ─── Mensagens sem ButtonPayload ───────────────────────────────

  it('ignora mensagens sem ButtonPayload (texto livre)', async () => {
    const req = mockReq({ From: 'whatsapp:+5491112345678', Body: 'Hola!' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(mockBookSlot.execute).not.toHaveBeenCalled();
    expect(mockHandleReminder.execute).not.toHaveBeenCalled();
    expect(mockDbQuery).not.toHaveBeenCalled();
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

  // ─── Resiliência ───────────────────────────────────────────────

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

  it('responde 200 mesmo se lookup na outbox falhar', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB timeout'));

    const req = mockReq({
      From: 'whatsapp:+5491112345678',
      ButtonPayload: 'slot_1',
      OriginalRepliedMessageSid: 'SM-fail',
    });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ─── Validação skipped em dev ──────────────────────────────────

  it('pula validação se TWILIO_INBOUND_WEBHOOK_URL não configurado', async () => {
    delete process.env.TWILIO_INBOUND_WEBHOOK_URL;
    mockValidateRequest.mockReturnValue(false);

    const req = mockReq({ From: 'whatsapp:+5491112345678', ButtonPayload: 'slot_1' });
    const res = mockRes();

    await controller.handleInbound(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBookSlot.execute).toHaveBeenCalled();
  });
});
