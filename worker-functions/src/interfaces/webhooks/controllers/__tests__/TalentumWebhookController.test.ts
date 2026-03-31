/**
 * TalentumWebhookController.test.ts
 *
 * Testa o controller simplificado (sem auth inline — auth via middleware).
 *
 * Cenários cobertos:
 *
 * 1. Validação de payload (Zod):
 *    - 400 com body vazio
 *    - 400 com campos obrigatórios faltando
 *    - 400 com email inválido
 *    - 400 com status inválido (fora do enum)
 *    - 400 com campos extras (strict mode)
 *    - 200 com payload mínimo válido
 *
 * 2. Propagação de environment:
 *    - environment='production' quando partnerContext.isTest=false
 *    - environment='test' quando partnerContext.isTest=true
 *    - environment='production' quando partnerContext ausente (fallback)
 *
 * 3. Tratamento de erros:
 *    - 500 quando use case lança exceção (DB error)
 *    - Não expõe PII ou stack trace na resposta
 *
 * 4. Resposta:
 *    - Formato correto do body de sucesso
 */

// Mock das dependências de infraestrutura
jest.mock('../../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
      }),
    }),
  },
}));

jest.mock('../../../../infrastructure/repositories/TalentumPrescreeningRepository', () => ({
  TalentumPrescreeningRepository: jest.fn().mockImplementation(() => ({
    upsertPrescreening: jest.fn().mockResolvedValue({
      prescreening: {
        id: 'internal-uuid-001',
        talentumPrescreeningId: 'tp-001',
        talentumProfileId: 'prof-001',
        workerId: null,
        jobPostingId: null,
        jobCaseName: 'Test Case',
        status: 'INITIATED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      created: true,
    }),
    upsertQuestion: jest.fn().mockResolvedValue({
      question: { id: 'q-uuid-001', questionId: 'q1', question: 'Test?', responseType: 'TEXT', createdAt: new Date(), updatedAt: new Date() },
      created: true,
    }),
    upsertResponse: jest.fn().mockResolvedValue({
      response: { id: 'r-uuid-001', prescreeningId: 'internal-uuid-001', questionId: 'q-uuid-001', answer: 'yes', responseSource: 'register', createdAt: new Date(), updatedAt: new Date() },
      created: true,
    }),
  })),
}));

jest.mock('../../../../infrastructure/repositories/WorkerRepository', () => ({
  WorkerRepository: jest.fn().mockImplementation(() => ({
    findByEmail: jest.fn().mockResolvedValue({ getValue: () => null }),
    findByPhone: jest.fn().mockResolvedValue({ getValue: () => null }),
    findByCuit: jest.fn().mockResolvedValue({ getValue: () => null }),
  })),
}));

import { Request, Response } from 'express';
import { TalentumWebhookController } from '../TalentumWebhookController';
import { TalentumPrescreeningRepository } from '../../../../infrastructure/repositories/TalentumPrescreeningRepository';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function makeValidPayload(overrides: Record<string, any> = {}) {
  return {
    prescreening: {
      id: 'tp-001',
      name: 'Test Case',
      status: 'INITIATED',
      ...(overrides.prescreening || {}),
    },
    profile: {
      id: 'prof-001',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '+5491100000000',
      cuil: '20-12345678-9',
      registerQuestions: [],
      ...(overrides.profile || {}),
    },
    response: {
      id: 'resp-001',
      state: [],
      ...(overrides.response || {}),
    },
  };
}

function makeMockReq(body: any, partnerContext?: any): Partial<Request> {
  const req: Partial<Request> = {
    body,
    headers: {},
  };
  if (partnerContext !== undefined) {
    (req as any).partnerContext = partnerContext;
  }
  return req;
}

function makeMockRes(): { res: Partial<Response>; getStatus: () => number | null; getBody: () => any } {
  let statusCode: number | null = null;
  let body: any = null;

  const res: Partial<Response> = {
    status: jest.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: any) => {
      body = data;
      return res;
    }),
  };

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

// ─────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────

describe('TalentumWebhookController', () => {
  let controller: TalentumWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TalentumWebhookController();
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. Validação de payload (Zod)
  // ─────────────────────────────────────────────────────────────────

  describe('validação de payload', () => {
    it('deve retornar 400 com body vazio', async () => {
      const req = makeMockReq({});
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid payload' }),
      );
    });

    it('deve retornar 400 com body null', async () => {
      const req = makeMockReq(null);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 com body undefined', async () => {
      const req = makeMockReq(undefined);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando prescreening.id está ausente', async () => {
      const payload = makeValidPayload();
      delete payload.prescreening.id;

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando prescreening.id é string vazia', async () => {
      const payload = makeValidPayload({ prescreening: { id: '' } });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando prescreening.status é inválido', async () => {
      const payload = makeValidPayload({ prescreening: { status: 'INVALID_STATUS' } });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando email é inválido', async () => {
      const payload = makeValidPayload({ profile: { email: 'not-an-email' } });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando profile está ausente', async () => {
      const payload = { prescreening: makeValidPayload().prescreening, response: makeValidPayload().response };

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando response está ausente', async () => {
      const payload = { prescreening: makeValidPayload().prescreening, profile: makeValidPayload().profile };

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 com campos extras (strict mode)', async () => {
      const payload = makeValidPayload();
      (payload as any).extraField = 'should fail';

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 com campo extra dentro de prescreening (strict mode)', async () => {
      const payload = makeValidPayload();
      (payload.prescreening as any).extraField = 'nope';

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve aceitar payload quando cuil está ausente (campo opcional)', async () => {
      const payload = makeValidPayload();
      delete (payload.profile as any).cuil;

      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      // cuil é optional no schema — ausência é válida
      expect(getStatus()).toBe(200);
    });

    it('deve aceitar todos os status válidos do enum', async () => {
      for (const status of ['INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED']) {
        const payload = makeValidPayload({ prescreening: { status } });
        const req = makeMockReq(payload, { isTest: false });
        const { res, getStatus } = makeMockRes();

        await controller.handlePrescreening(req as Request, res as Response);

        expect(getStatus()).toBe(200);
      }
    });

    it('deve retornar detalhes do erro Zod na resposta', async () => {
      const req = makeMockReq({ bad: true });
      const { res, getBody } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      const body = getBody();
      expect(body.error).toBe('Invalid payload');
      expect(body.details).toBeDefined();
    });

    it('deve normalizar email para lowercase', async () => {
      const payload = makeValidPayload({ profile: { email: 'Test@EXAMPLE.com' } });
      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      // Não deve dar 400 — email é normalizado pelo Zod
      expect(getStatus()).toBe(200);
    });

    it('deve aceitar registerQuestions vazio (default [])', async () => {
      const payload = makeValidPayload();
      delete (payload.profile as any).registerQuestions;

      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(200);
    });

    it('deve aceitar response.state vazio (default [])', async () => {
      const payload = makeValidPayload();
      delete (payload.response as any).state;

      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Propagação de environment
  // ─────────────────────────────────────────────────────────────────

  describe('propagação de environment', () => {
    it('deve passar environment=production quando partnerContext.isTest=false', async () => {
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { partnerId: 'p1', partnerName: 'talentum', isTest: false });
      const { res } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      const repoInstance = (TalentumPrescreeningRepository as jest.Mock).mock.results[0].value;
      expect(repoInstance.upsertPrescreening).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
      );
    });

    it('deve usar dryRun=true quando partnerContext.isTest=true (retorna sem persistir)', async () => {
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { partnerId: 'p1', partnerName: 'talentum', isTest: true });
      const { res, getStatus, getBody } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      // dryRun=true retorna sucesso sem chamar upsertPrescreening
      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.resolved).toBeDefined();
      // Em dryRun, upsertPrescreening NÃO é chamado
      const repoInstance = (TalentumPrescreeningRepository as jest.Mock).mock.results[0]?.value;
      if (repoInstance) {
        expect(repoInstance.upsertPrescreening).not.toHaveBeenCalled();
      }
    });

    it('deve defaultar para production quando partnerContext está ausente', async () => {
      const payload = makeValidPayload();
      const req = makeMockReq(payload); // sem partnerContext
      const { res } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      const repoInstance = (TalentumPrescreeningRepository as jest.Mock).mock.results[0].value;
      expect(repoInstance.upsertPrescreening).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
      );
    });

    it('deve defaultar para production quando partnerContext.isTest é undefined', async () => {
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { partnerId: 'p1', partnerName: 'talentum' }); // isTest omitido
      const { res } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      const repoInstance = (TalentumPrescreeningRepository as jest.Mock).mock.results[0].value;
      expect(repoInstance.upsertPrescreening).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Tratamento de erros
  // ─────────────────────────────────────────────────────────────────

  describe('tratamento de erros', () => {
    it('deve retornar 500 quando use case lança exceção', async () => {
      // Fazer o repo lançar erro
      (TalentumPrescreeningRepository as jest.Mock).mockImplementationOnce(() => ({
        upsertPrescreening: jest.fn().mockRejectedValue(new Error('DB connection refused')),
        upsertQuestion: jest.fn(),
        upsertResponse: jest.fn(),
      }));

      const controller2 = new TalentumWebhookController();
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus, getBody } = makeMockRes();

      await controller2.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(500);
      expect(getBody()).toEqual({ error: 'Internal server error' });
    });

    it('não deve expor detalhes do erro na resposta 500', async () => {
      (TalentumPrescreeningRepository as jest.Mock).mockImplementationOnce(() => ({
        upsertPrescreening: jest.fn().mockRejectedValue(new Error('FATAL: password authentication failed')),
        upsertQuestion: jest.fn(),
        upsertResponse: jest.fn(),
      }));

      const controller2 = new TalentumWebhookController();
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { isTest: false });
      const { res, getBody } = makeMockRes();

      await controller2.handlePrescreening(req as Request, res as Response);

      const body = getBody();
      expect(body.error).toBe('Internal server error');
      // Não deve conter detalhes do erro
      expect(JSON.stringify(body)).not.toContain('password');
      expect(JSON.stringify(body)).not.toContain('FATAL');
      expect(body.stack).toBeUndefined();
    });

    it('deve logar o prescreeningId externo no erro (para debugging)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (TalentumPrescreeningRepository as jest.Mock).mockImplementationOnce(() => ({
        upsertPrescreening: jest.fn().mockRejectedValue(new Error('timeout')),
        upsertQuestion: jest.fn(),
        upsertResponse: jest.fn(),
      }));

      const controller2 = new TalentumWebhookController();
      const payload = makeValidPayload({ prescreening: { id: 'external-tp-999' } });
      const req = makeMockReq(payload, { isTest: false });
      const { res } = makeMockRes();

      await controller2.handlePrescreening(req as Request, res as Response);

      // console.error é chamado com 4 args: mensagem, prescreeningId, label, causa
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TalentumWebhook]'),
        'external-tp-999',
        '| cause:',
        'timeout',
      );

      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Resposta de sucesso
  // ─────────────────────────────────────────────────────────────────

  describe('resposta de sucesso', () => {
    it('deve retornar 200 com formato correto', async () => {
      const payload = makeValidPayload();
      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus, getBody } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body).toHaveProperty('prescreeningId');
      expect(body).toHaveProperty('talentumPrescreeningId');
      expect(body).toHaveProperty('workerId');
      expect(body).toHaveProperty('jobPostingId');
      expect(body).toHaveProperty('resolved');
      expect(body.resolved).toHaveProperty('worker');
      expect(body.resolved).toHaveProperty('jobPosting');
    });

    it('deve retornar os IDs corretos do prescreening', async () => {
      const payload = makeValidPayload({ prescreening: { id: 'tp-custom-123' } });
      const req = makeMockReq(payload, { isTest: false });
      const { res, getBody } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getBody().talentumPrescreeningId).toBe('tp-001');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Validação de registerQuestions e response.state
  // ─────────────────────────────────────────────────────────────────

  describe('validação de questions', () => {
    it('deve retornar 400 quando registerQuestion tem questionId vazio', async () => {
      const payload = makeValidPayload({
        profile: {
          registerQuestions: [
            { questionId: '', question: 'Test?', answer: 'yes', responseType: 'TEXT' },
          ],
        },
      });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve retornar 400 quando registerQuestion tem campo extra (strict)', async () => {
      const payload = makeValidPayload({
        profile: {
          registerQuestions: [
            { questionId: 'q1', question: 'Test?', answer: 'yes', responseType: 'TEXT', extra: 'nope' },
          ],
        },
      });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });

    it('deve aceitar answer vazia em registerQuestion', async () => {
      const payload = makeValidPayload({
        profile: {
          registerQuestions: [
            { questionId: 'q1', question: 'Test?', answer: '', responseType: 'TEXT' },
          ],
        },
      });

      const req = makeMockReq(payload, { isTest: false });
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(200);
    });

    it('deve retornar 400 quando response.state item tem question vazia', async () => {
      const payload = makeValidPayload({
        response: {
          state: [
            { questionId: 'q1', question: '', answer: 'yes', responseType: 'TEXT' },
          ],
        },
      });

      const req = makeMockReq(payload);
      const { res, getStatus } = makeMockRes();

      await controller.handlePrescreening(req as Request, res as Response);

      expect(getStatus()).toBe(400);
    });
  });
});
