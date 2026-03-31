/**
 * GetWorkerProgressUseCase.test.ts
 *
 * Testa a busca de progresso do worker por authUid.
 * Este use case é o coração do fluxo "Worker not found":
 * quando o worker existe no banco mas não tem auth_uid vinculado,
 * findByAuthUid retorna null e o use case deve retornar Result.fail('Worker not found').
 *
 * Cenários:
 * 1. Worker encontrado — retorna Result.ok com o worker
 * 2. Worker não encontrado — findByAuthUid retorna null → Result.fail('Worker not found')
 * 3. Erro no repositório — propaga o erro sem mascarar
 * 4. authUid repassado corretamente — garante que o argumento exato chega ao repositório
 */

import { GetWorkerProgressUseCase } from '../GetWorkerProgressUseCase';
import { Result } from '../../../domain/shared/Result';
import { Worker } from '../../../domain/entities/Worker';

// ─── Dados de teste ───────────────────────────────────────────────────────────

const AUTH_UID = 'firebase-uid-abc123XYZ';
const WORKER_ID = 'a1b2c3d4-0000-4abc-8000-000000000001';

const mockWorker: Worker = {
  id: WORKER_ID,
  authUid: AUTH_UID,
  email: 'worker@example.com',
  phone: '+5511999887766',
  currentStep: 1,
  status: 'INCOMPLETE_REGISTER',
  country: 'BR',
  timezone: 'America/Sao_Paulo',
  registrationCompleted: false,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
};

// ─── Factory de repositório mock ──────────────────────────────────────────────

const makeRepository = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  findByEmail: jest.fn(),
  findByPhone: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateAuthUid: jest.fn(),
  updateImportedWorkerData: jest.fn(),
  updatePersonalInfo: jest.fn(),
  delete: jest.fn(),
  deleteByAuthUid: jest.fn(),
  ...overrides,
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('GetWorkerProgressUseCase', () => {

  describe('Cenário 1 — Worker encontrado no banco', () => {
    it('deve retornar Result.ok com o worker quando findByAuthUid encontra registro', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute(AUTH_UID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockWorker);
    });

    it('deve retornar o worker exatamente como retornado pelo repositório', async () => {
      const workerComDadosExtras = {
        ...mockWorker,
        firstName: 'Joana',
        lastName: 'Silva',
        serviceCity: 'São Paulo',
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(workerComDadosExtras)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute(AUTH_UID);

      expect(result.getValue()).toBe(workerComDadosExtras);
    });
  });

  describe('Cenário 2 — Worker não encontrado (auth_uid não vinculado)', () => {
    it('deve retornar Result.fail com mensagem "Worker not found" quando findByAuthUid retorna null', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute(AUTH_UID);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Worker not found');
    });

    it('deve marcar isSuccess como false quando worker não é encontrado', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute('uid-que-nao-existe');

      expect(result.isSuccess).toBe(false);
    });
  });

  describe('Cenário 3 — Erro no repositório', () => {
    it('deve propagar o erro do repositório sem mascarar quando findByAuthUid falha', async () => {
      const mensagemDeErro = 'Falha na conexão com o banco: connection timeout';
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.fail(mensagemDeErro)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute(AUTH_UID);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(mensagemDeErro);
    });

    it('deve propagar qualquer mensagem de erro do repositório sem modificá-la', async () => {
      const erroEspecifico = 'Failed to find worker: ECONNREFUSED 127.0.0.1:5432';
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.fail(erroEspecifico)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      const result = await useCase.execute(AUTH_UID);

      expect(result.error).toBe(erroEspecifico);
    });
  });

  describe('Cenário 4 — authUid repassado corretamente ao repositório', () => {
    it('deve chamar findByAuthUid com o authUid exato recebido', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);
      const authUidEspecifico = 'uid-especifico-que-deve-ser-repassado';

      await useCase.execute(authUidEspecifico);

      expect(repo.findByAuthUid).toHaveBeenCalledWith(authUidEspecifico);
    });

    it('deve chamar findByAuthUid exatamente uma vez por execução', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      await useCase.execute(AUTH_UID);

      expect(repo.findByAuthUid).toHaveBeenCalledTimes(1);
    });

    it('deve chamar findByAuthUid com o authUid exato mesmo quando worker não existe', async () => {
      const uidQueNaoExiste = 'uid-orphan-sem-vinculo-no-banco';
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerProgressUseCase(repo as any);

      await useCase.execute(uidQueNaoExiste);

      expect(repo.findByAuthUid).toHaveBeenCalledWith(uidQueNaoExiste);
    });
  });
});
