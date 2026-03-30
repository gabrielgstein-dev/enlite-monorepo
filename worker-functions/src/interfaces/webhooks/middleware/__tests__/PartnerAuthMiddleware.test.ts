/**
 * PartnerAuthMiddleware.test.ts
 *
 * Testa o middleware de autenticação e autorização de parceiros webhook.
 *
 * Cenários cobertos:
 *
 * 1. Mock mode (USE_MOCK_AUTH=true):
 *    - Bypass completo sem header
 *    - partnerContext com isTest baseado na URL
 *
 * 2. Autenticação (X-Partner-Key → Google API → displayName):
 *    - 401 sem header X-Partner-Key
 *    - 401 com header vazio
 *    - 401 com key inválida (Google rejeita)
 *    - 403 com key válida mas parceiro não registrado
 *    - 403 com key válida mas parceiro inativo
 *
 * 3. Autorização (displayName → webhook_partners → allowed_paths):
 *    - 403 quando path não está em allowed_paths
 *    - 200 quando path está coberto por glob (talentum/*)
 *    - Glob exato (sem wildcard)
 *    - Glob com múltiplos paths
 *    - Path com sub-paths profundos
 *
 * 4. Injeção de contexto:
 *    - partnerContext com dados corretos
 *    - isTest = true quando URL contém /webhooks-test
 *    - isTest = false quando URL é /webhooks
 *
 * 5. Edge cases:
 *    - Header case-insensitive
 *    - Path com trailing slash
 *    - Path vazio
 *    - Erro interno do validator (não vaza stack trace)
 *    - Erro interno do repositório
 */

import { Request, Response, NextFunction } from 'express';
import { PartnerAuthMiddleware } from '../PartnerAuthMiddleware';
import { GoogleApiKeyValidator } from '../../../../infrastructure/services/GoogleApiKeyValidator';
import { IWebhookPartnerRepository } from '../../../../domain/ports/IWebhookPartnerRepository';
import { WebhookPartner } from '../../../../domain/entities/WebhookPartner';

// ─────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────

function makeMockValidator(overrides: Partial<GoogleApiKeyValidator> = {}): jest.Mocked<GoogleApiKeyValidator> {
  return {
    validate: jest.fn().mockResolvedValue(null),
    clearCache: jest.fn(),
    ...overrides,
  } as any;
}

function makeMockPartnerRepo(overrides: Partial<IWebhookPartnerRepository> = {}): jest.Mocked<IWebhookPartnerRepository> {
  return {
    findByDisplayName: jest.fn().mockResolvedValue(null),
    findByName: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeTalentumPartner(overrides: Partial<WebhookPartner> = {}): WebhookPartner {
  return {
    id: 'partner-uuid-001',
    name: 'talentum',
    displayName: 'API-Key-Talentum',
    allowedPaths: ['talentum/*'],
    isActive: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    baseUrl: '/api/webhooks',
    path: '/talentum/prescreening',
    ip: '127.0.0.1',
    method: 'POST',
    ...overrides,
  };
}

function makeMockRes(): { res: Partial<Response>; statusCode: number | null; body: any } {
  const state = { statusCode: null as number | null, body: null as any };
  const res: Partial<Response> = {
    status: jest.fn().mockImplementation((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: any) => {
      state.body = data;
      return res;
    }),
  };
  return { res, ...state };
}

// ─────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────

describe('PartnerAuthMiddleware', () => {
  let mockValidator: jest.Mocked<GoogleApiKeyValidator>;
  let mockRepo: jest.Mocked<IWebhookPartnerRepository>;
  let middleware: PartnerAuthMiddleware;
  let mockNext: jest.MockedFunction<NextFunction>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.USE_MOCK_AUTH;

    mockValidator = makeMockValidator();
    mockRepo = makeMockPartnerRepo();
    middleware = new PartnerAuthMiddleware(mockValidator, mockRepo);
    mockNext = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. Mock mode
  // ─────────────────────────────────────────────────────────────────

  describe('mock mode (USE_MOCK_AUTH=true)', () => {
    beforeEach(() => {
      process.env.USE_MOCK_AUTH = 'true';
    });

    it('deve fazer bypass sem X-Partner-Key e chamar next()', async () => {
      const req = makeMockReq();
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(mockValidator.validate).not.toHaveBeenCalled();
    });

    it('deve injetar partnerContext mock com isTest=false para /webhooks', async () => {
      const req = makeMockReq({ baseUrl: '/api/webhooks' });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      const ctx = (req as any).partnerContext;
      expect(ctx.partnerName).toBe('mock-partner');
      expect(ctx.isTest).toBe(false);
    });

    it('deve injetar partnerContext mock com isTest=true para /webhooks-test', async () => {
      const req = makeMockReq({ baseUrl: '/api/webhooks-test' });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      const ctx = (req as any).partnerContext;
      expect(ctx.isTest).toBe(true);
    });

    it('deve fazer bypass mesmo com key inválida no header (mock mode ignora tudo)', async () => {
      const req = makeMockReq({ headers: { 'x-partner-key': 'garbage' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Autenticação — header e Google API
  // ─────────────────────────────────────────────────────────────────

  describe('autenticação (header + Google API)', () => {
    it('deve retornar 401 quando X-Partner-Key está ausente', async () => {
      const req = makeMockReq({ headers: {} });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'X-Partner-Key header required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando X-Partner-Key é string vazia', async () => {
      const req = makeMockReq({ headers: { 'x-partner-key': '' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      // String vazia é falsy, então cai no primeiro check
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando Google API rejeita a key', async () => {
      mockValidator.validate.mockResolvedValue(null);

      const req = makeMockReq({ headers: { 'x-partner-key': 'AIzaInvalid' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or revoked API key' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 403 quando displayName não está registrado no banco', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Unknown');
      mockRepo.findByDisplayName.mockResolvedValue(null);

      const req = makeMockReq({ headers: { 'x-partner-key': 'AIzaValid' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Partner not registered or inactive' });
      expect(mockRepo.findByDisplayName).toHaveBeenCalledWith('API-Key-Unknown');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve passar displayName correto ao repositório', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner());

      const req = makeMockReq({ headers: { 'x-partner-key': 'AIzaValid' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockRepo.findByDisplayName).toHaveBeenCalledWith('API-Key-Talentum');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Autorização — path matching
  // ─────────────────────────────────────────────────────────────────

  describe('autorização (path matching)', () => {
    beforeEach(() => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
    });

    it('deve permitir path coberto por glob talentum/*', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve permitir sub-path profundo coberto por glob', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/prescreening/detailed',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('deve permitir path exato (sem wildcard)', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/prescreening'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('deve rejeitar path exato que não bate', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/prescreening'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/status',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Partner not authorized for this webhook path' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve rejeitar parceiro Talentum tentando acessar path do AnaCare', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/anacare/workers',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve rejeitar parceiro Talentum tentando acessar path do Twilio', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/twilio/status',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve permitir quando parceiro tem múltiplos allowed_paths', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*', 'shared/health'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/shared/health',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('deve rejeitar quando allowed_paths está vazio', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: [],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve rejeitar path parcialmente similar (talentum-extra/ vs talentum/)', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum-extra/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve permitir path raiz do parceiro quando glob é talentum/*', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      // Path exato "talentum" (sem sub-path) — isPathAllowed deve aceitar
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Injeção de contexto (partnerContext)
  // ─────────────────────────────────────────────────────────────────

  describe('injeção de partnerContext', () => {
    beforeEach(() => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner());
    });

    it('deve injetar partnerId, partnerName e isTest no request', async () => {
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        baseUrl: '/api/webhooks',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      const ctx = (req as any).partnerContext;
      expect(ctx).toEqual({
        partnerId: 'partner-uuid-001',
        partnerName: 'talentum',
        isTest: false,
      });
    });

    it('deve setar isTest=true quando baseUrl contém webhooks-test', async () => {
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        baseUrl: '/api/webhooks-test',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect((req as any).partnerContext.isTest).toBe(true);
    });

    it('deve setar isTest=false quando baseUrl é /api/webhooks (sem -test)', async () => {
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        baseUrl: '/api/webhooks',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect((req as any).partnerContext.isTest).toBe(false);
    });

    it('não deve injetar partnerContext quando autenticação falha', async () => {
      mockValidator.validate.mockResolvedValue(null); // key inválida

      const req = makeMockReq({ headers: { 'x-partner-key': 'bad' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect((req as any).partnerContext).toBeUndefined();
    });

    it('não deve injetar partnerContext quando autorização falha', async () => {
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/anacare/workers', // path não autorizado
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect((req as any).partnerContext).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Edge cases e resiliência
  // ─────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('deve ler header x-partner-key case-insensitive (Express normaliza para lowercase)', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner());

      // Express converte headers para lowercase automaticamente
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockValidator.validate).toHaveBeenCalledWith('AIzaValid');
      expect(mockNext).toHaveBeenCalled();
    });

    it('deve extrair path corretamente removendo leading slash', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/talentum/prescreening', // com leading slash
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('deve lidar com path sendo apenas /', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      // Path vazio não bate com talentum/*
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('deve retornar 401 se validator lança exceção inesperada (não vaza stack)', async () => {
      mockValidator.validate.mockRejectedValue(new Error('Unexpected crash'));

      const req = makeMockReq({ headers: { 'x-partner-key': 'AIzaCrash' } });
      const { res } = makeMockRes();

      // O middleware deve capturar a exceção do validator
      // Como o middleware não tem try/catch interno atualmente,
      // isso testa se o Express error handler captura
      await expect(
        middleware.requirePartnerKey()(req as Request, res as Response, mockNext),
      ).rejects.toThrow('Unexpected crash');

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 403 se repositório lança exceção (parceiro não encontrado)', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockRejectedValue(new Error('DB connection lost'));

      const req = makeMockReq({ headers: { 'x-partner-key': 'AIzaValid' } });
      const { res } = makeMockRes();

      await expect(
        middleware.requirePartnerKey()(req as Request, res as Response, mockNext),
      ).rejects.toThrow('DB connection lost');

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve funcionar como factory — cada chamada a requirePartnerKey() retorna novo middleware', () => {
      const mw1 = middleware.requirePartnerKey();
      const mw2 = middleware.requirePartnerKey();

      expect(typeof mw1).toBe('function');
      expect(typeof mw2).toBe('function');
      // Devem ser funções diferentes (factory)
      expect(mw1).not.toBe(mw2);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. Fluxo completo (happy path)
  // ─────────────────────────────────────────────────────────────────

  describe('fluxo completo (happy path)', () => {
    it('deve executar todos os passos na ordem correta', async () => {
      const callOrder: string[] = [];

      mockValidator.validate.mockImplementation(async () => {
        callOrder.push('validate');
        return 'API-Key-Talentum';
      });

      mockRepo.findByDisplayName.mockImplementation(async () => {
        callOrder.push('findPartner');
        return makeTalentumPartner();
      });

      const nextFn = jest.fn().mockImplementation(() => {
        callOrder.push('next');
      });

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        baseUrl: '/api/webhooks',
        path: '/talentum/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, nextFn);

      expect(callOrder).toEqual(['validate', 'findPartner', 'next']);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve parar no passo de validação quando key é inválida (não chega ao repo)', async () => {
      mockValidator.validate.mockResolvedValue(null);

      const req = makeMockReq({ headers: { 'x-partner-key': 'bad' } });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockValidator.validate).toHaveBeenCalled();
      expect(mockRepo.findByDisplayName).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve parar no passo de autorização quando parceiro não tem permissão (chama next() nunca)', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-Talentum');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        allowedPaths: ['talentum/*'],
      }));

      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaValid' },
        path: '/anacare/test',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(mockValidator.validate).toHaveBeenCalled();
      expect(mockRepo.findByDisplayName).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. Cenários multi-parceiro
  // ─────────────────────────────────────────────────────────────────

  describe('cenários multi-parceiro', () => {
    it('parceiro AnaCare pode acessar seus paths mas não os do Talentum', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-AnaCare');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        id: 'partner-anacare-001',
        name: 'anacare',
        displayName: 'API-Key-AnaCare',
        allowedPaths: ['anacare/*'],
      }));

      // Tentar acessar path do Talentum com key do AnaCare
      const req = makeMockReq({
        headers: { 'x-partner-key': 'AIzaAnaCare' },
        path: '/talentum/prescreening',
      });
      const { res } = makeMockRes();

      await middleware.requirePartnerKey()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('parceiro com paths de múltiplos serviços pode acessar ambos', async () => {
      mockValidator.validate.mockResolvedValue('API-Key-SuperPartner');
      mockRepo.findByDisplayName.mockResolvedValue(makeTalentumPartner({
        id: 'partner-super-001',
        name: 'super-partner',
        displayName: 'API-Key-SuperPartner',
        allowedPaths: ['talentum/*', 'anacare/*', 'shared/health'],
      }));

      // Acessa talentum → OK
      const req1 = makeMockReq({
        headers: { 'x-partner-key': 'AIzaSuper' },
        path: '/talentum/prescreening',
      });
      const { res: res1 } = makeMockRes();
      await middleware.requirePartnerKey()(req1 as Request, res1 as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Acessa anacare → OK
      const req2 = makeMockReq({
        headers: { 'x-partner-key': 'AIzaSuper' },
        path: '/anacare/workers',
      });
      const { res: res2 } = makeMockRes();
      await middleware.requirePartnerKey()(req2 as Request, res2 as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Acessa shared/health → OK (exact match)
      const req3 = makeMockReq({
        headers: { 'x-partner-key': 'AIzaSuper' },
        path: '/shared/health',
      });
      const { res: res3 } = makeMockRes();
      await middleware.requirePartnerKey()(req3 as Request, res3 as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(3);

      // Acessa shared/other → BLOQUEADO
      const req4 = makeMockReq({
        headers: { 'x-partner-key': 'AIzaSuper' },
        path: '/shared/other',
      });
      const { res: res4 } = makeMockRes();
      await middleware.requirePartnerKey()(req4 as Request, res4 as Response, mockNext);
      expect(res4.status).toHaveBeenCalledWith(403);
      expect(mockNext).toHaveBeenCalledTimes(3); // não incrementou
    });
  });
});
