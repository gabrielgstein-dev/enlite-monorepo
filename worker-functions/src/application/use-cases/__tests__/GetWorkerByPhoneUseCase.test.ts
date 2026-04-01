/**
 * GetWorkerByPhoneUseCase.test.ts
 *
 * Testa a busca de worker por número de telefone.
 *
 * Cenários:
 * 1. Worker encontrado → retorna Result.ok com o worker
 * 2. Worker não encontrado (null) → Result.fail('Worker not found')
 * 3. Erro do repositório → propaga o erro sem mascarar
 * 4. Telefone com caracteres especiais → normalizado antes de chamar findByPhone
 * 5. Telefone vazio → Result.fail('Phone number is required')
 * 6. Telefone só com não-dígitos → Result.fail('Phone number is required')
 * 7. findByPhone chamado exatamente uma vez com o telefone normalizado
 */

import { GetWorkerByPhoneUseCase } from '../GetWorkerByPhoneUseCase';
import { Result } from '../../../domain/shared/Result';
import { Worker } from '../../../domain/entities/Worker';

// ─── Dados de teste ───────────────────────────────────────────────────────────

const WORKER_ID = 'b2c3d4e5-0000-4abc-8000-000000000002';
const PHONE_NORMALIZED = '5491151265663';

const mockWorker: Worker = {
  id: WORKER_ID,
  authUid: 'firebase-uid-xyz789',
  email: 'worker@example.com',
  phone: `+${PHONE_NORMALIZED}`,
  currentStep: 2,
  status: 'REGISTERED',
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  registrationCompleted: true,
  createdAt: new Date('2024-03-10T08:00:00Z'),
  updatedAt: new Date('2024-03-10T08:00:00Z'),
};

// ─── Factory de repositório mock ──────────────────────────────────────────────

const makeRepository = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  findByAuthUid: jest.fn(),
  findByEmail: jest.fn(),
  findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
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

describe('GetWorkerByPhoneUseCase', () => {

  describe('Cenário 1 — Worker encontrado no banco', () => {
    it('deve retornar Result.ok com o worker quando findByPhone encontra registro', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute(PHONE_NORMALIZED);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockWorker);
    });

    it('deve retornar o worker exatamente como retornado pelo repositório', async () => {
      const workerComDadosExtras = {
        ...mockWorker,
        firstName: 'Carlos',
        lastName: 'Gomez',
        serviceCity: 'Buenos Aires',
      };
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(workerComDadosExtras)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute(PHONE_NORMALIZED);

      expect(result.getValue()).toBe(workerComDadosExtras);
    });
  });

  describe('Cenário 2 — Worker não encontrado', () => {
    it('deve retornar Result.fail com mensagem "Worker not found" quando findByPhone retorna null', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute(PHONE_NORMALIZED);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Worker not found');
    });

    it('deve marcar isSuccess como false quando worker não é encontrado', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute('99999999999');

      expect(result.isSuccess).toBe(false);
    });
  });

  describe('Cenário 3 — Erro no repositório', () => {
    it('deve propagar o erro do repositório sem mascarar quando findByPhone falha', async () => {
      const mensagemDeErro = 'Falha na conexão com o banco: connection timeout';
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.fail(mensagemDeErro)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute(PHONE_NORMALIZED);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(mensagemDeErro);
    });

    it('deve propagar qualquer mensagem de erro do repositório sem modificá-la', async () => {
      const erroEspecifico = 'Failed to find worker by phone: ECONNREFUSED 127.0.0.1:5432';
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.fail(erroEspecifico)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute(PHONE_NORMALIZED);

      expect(result.error).toBe(erroEspecifico);
    });
  });

  describe('Cenário 4 — Normalização de telefone com caracteres especiais', () => {
    it('deve normalizar "+54 9 11 5126-5663" para "5491151265663" antes de chamar findByPhone', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute('+54 9 11 5126-5663');

      expect(repo.findByPhone).toHaveBeenCalledWith('5491151265663');
    });

    it('deve remover todos os caracteres não-dígitos antes de passar ao repositório', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute('(55) 11 9 8877-6655');

      expect(repo.findByPhone).toHaveBeenCalledWith('55119887766​55'.replace(/\D/g, ''));
    });
  });

  describe('Cenário 5 — Telefone vazio', () => {
    it('deve retornar Result.fail("Phone number is required") quando phone é string vazia', async () => {
      const repo = makeRepository();
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Phone number is required');
    });

    it('não deve chamar findByPhone quando phone é vazio', async () => {
      const repo = makeRepository();
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute('');

      expect(repo.findByPhone).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 6 — Telefone somente com não-dígitos', () => {
    it('deve retornar Result.fail("Phone number is required") quando phone tem apenas "---"', async () => {
      const repo = makeRepository();
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      const result = await useCase.execute('---');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Phone number is required');
    });

    it('não deve chamar findByPhone quando phone normalizado resulta em string vazia', async () => {
      const repo = makeRepository();
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute('(+) - --');

      expect(repo.findByPhone).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 7 — findByPhone chamado exatamente uma vez', () => {
    it('deve chamar findByPhone com o telefone normalizado exato recebido', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute(PHONE_NORMALIZED);

      expect(repo.findByPhone).toHaveBeenCalledWith(PHONE_NORMALIZED);
    });

    it('deve chamar findByPhone exatamente uma vez por execução', async () => {
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute(PHONE_NORMALIZED);

      expect(repo.findByPhone).toHaveBeenCalledTimes(1);
    });

    it('deve chamar findByPhone com o phone normalizado mesmo quando worker não existe', async () => {
      const phoneComFormato = '+55 (11) 99999-8888';
      const phoneNormalizado = '5511999998888';
      const repo = makeRepository({
        findByPhone: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new GetWorkerByPhoneUseCase(repo as any);

      await useCase.execute(phoneComFormato);

      expect(repo.findByPhone).toHaveBeenCalledWith(phoneNormalizado);
    });
  });
});
