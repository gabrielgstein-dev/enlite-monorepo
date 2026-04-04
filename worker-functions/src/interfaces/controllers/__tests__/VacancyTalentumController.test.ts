/**
 * VacancyTalentumController.test.ts
 *
 * Testa o metodo syncFromTalentum (Step 4 do sync).
 *
 * Cenarios:
 *  1. Retorna 200 com relatorio JSON
 *  2. Retorna 502 se falha na comunicacao com Talentum
 *  3. Retorna 500 se falha no Gemini ou DB
 *  4. Formato correto do response
 */

// ── Mocks ────────────────────────────────────────────────────────

const mockExecute = jest.fn();

jest.mock('../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        connect: jest.fn().mockResolvedValue({
          query: jest.fn().mockResolvedValue({ rows: [] }),
          release: jest.fn(),
        }),
      }),
    }),
  },
}));

jest.mock('../../../application/use-cases/SyncTalentumVacanciesUseCase', () => ({
  SyncTalentumVacanciesUseCase: jest.fn().mockImplementation(() => ({
    execute: mockExecute,
  })),
}));

jest.mock('../../../application/use-cases/PublishVacancyToTalentumUseCase', () => ({
  PublishVacancyToTalentumUseCase: jest.fn().mockImplementation(() => ({
    publish: jest.fn(),
    unpublish: jest.fn(),
  })),
  PublishError: class PublishError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('../../../infrastructure/services/TalentumDescriptionService', () => ({
  TalentumDescriptionService: jest.fn().mockImplementation(() => ({
    generateDescription: jest.fn(),
  })),
}));

// ── Imports ──────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { VacancyTalentumController } from '../VacancyTalentumController';
import type { SyncReport } from '../../../application/use-cases/SyncTalentumVacanciesUseCase';

// ── Helpers ──────────────────────────────────────────────────────

function makeMockReq(): Partial<Request> {
  return {
    params: {},
    body: {},
    headers: {},
    query: {},
  };
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

// ── Tests ────────────────────────────────────────────────────────

describe('VacancyTalentumController — syncFromTalentum', () => {
  let controller: VacancyTalentumController;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation();
    controller = new VacancyTalentumController();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Sucesso ──────────────────────────────────────────────────

  describe('sucesso', () => {
    it('deve retornar 200 com relatorio completo', async () => {
      const report: SyncReport = {
        total: 10,
        updated: 5,
        created: 3,
        skipped: 1,
        errors: [{ projectId: 'p1', title: 'CASO 1', error: 'parse failed' }],
      };
      mockExecute.mockResolvedValue(report);

      const req = makeMockReq();
      const { res, getStatus, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(report);
    });

    it('deve retornar 200 com sync vazio', async () => {
      const emptyReport: SyncReport = {
        total: 0,
        updated: 0,
        created: 0,
        skipped: 0,
        errors: [],
      };
      mockExecute.mockResolvedValue(emptyReport);

      const req = makeMockReq();
      const { res, getStatus, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(200);
      expect(getBody().data.total).toBe(0);
    });
  });

  // ── Erro Talentum (502) ──────────────────────────────────────

  describe('erro Talentum → 502', () => {
    it('deve retornar 502 quando mensagem contem "Talentum"', async () => {
      mockExecute.mockRejectedValue(new Error('[TalentumApiClient] login failed — HTTP 401'));

      const req = makeMockReq();
      const { res, getStatus, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(502);
      expect(getBody().success).toBe(false);
      expect(getBody().error).toContain('Talentum communication');
    });

    it('deve retornar 502 quando mensagem contem "tl_auth"', async () => {
      mockExecute.mockRejectedValue(new Error('tl_auth/tl_refresh cookies were not found'));

      const req = makeMockReq();
      const { res, getStatus } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(502);
    });
  });

  // ── Erro generico (500) ──────────────────────────────────────

  describe('erro generico → 500', () => {
    it('deve retornar 500 quando erro e do Gemini', async () => {
      mockExecute.mockRejectedValue(new Error('Gemini API error 500: internal'));

      const req = makeMockReq();
      const { res, getStatus, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(500);
      expect(getBody().success).toBe(false);
      expect(getBody().error).toContain('Failed sync');
    });

    it('deve retornar 500 quando erro e do DB', async () => {
      mockExecute.mockRejectedValue(new Error('connection refused'));

      const req = makeMockReq();
      const { res, getStatus } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getStatus()).toBe(500);
    });

    it('deve incluir details com mensagem do erro', async () => {
      mockExecute.mockRejectedValue(new Error('specific error detail'));

      const req = makeMockReq();
      const { res, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      expect(getBody().details).toBe('specific error detail');
    });
  });

  // ── Formato do response ──────────────────────────────────────

  describe('formato do response', () => {
    it('deve incluir campos total, updated, created, skipped, errors', async () => {
      const report: SyncReport = {
        total: 15,
        updated: 10,
        created: 3,
        skipped: 2,
        errors: [],
      };
      mockExecute.mockResolvedValue(report);

      const req = makeMockReq();
      const { res, getBody } = makeMockRes();

      await controller.syncFromTalentum(req as Request, res as Response);

      const data = getBody().data;
      expect(data).toHaveProperty('total', 15);
      expect(data).toHaveProperty('updated', 10);
      expect(data).toHaveProperty('created', 3);
      expect(data).toHaveProperty('skipped', 2);
      expect(data).toHaveProperty('errors');
      expect(data.errors).toEqual([]);
    });
  });
});
