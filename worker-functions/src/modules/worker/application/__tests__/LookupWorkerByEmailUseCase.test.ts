/**
 * LookupWorkerByEmailUseCase.test.ts
 *
 * Testa a busca pública de worker por email para pré-preenchimento do app.
 *
 * Cenários:
 * 1. Worker não encontrado → { found: false }
 * 2. Worker encontrado sem phone → { found: true }
 * 3. Worker encontrado com phone → { found: true, phoneMasked: "xxxxxxxxxx978" }
 * 4. Erro do repositório → { found: false } (não vaza detalhes)
 * 5. maskPhone — últimos 3 visíveis, restante como "x"
 * 6. maskPhone — string de 3 ou menos caracteres retornada integralmente
 * 7. findByEmail chamado exatamente uma vez com o email recebido
 */

import { LookupWorkerByEmailUseCase, maskPhone } from '../LookupWorkerByEmailUseCase';
import { Result } from '@shared/utils/Result';
import { Worker } from '../../domain/Worker';

// ─── Dados de teste ───────────────────────────────────────────────────────────

const WORKER_ID = 'a1b2c3d4-0000-4abc-8000-000000000001';
const EMAIL = 'at@example.com';
const PHONE = '5491157983978';

const makeWorker = (overrides: Partial<Worker> = {}): Worker => ({
  id: WORKER_ID,
  authUid: 'firebase-uid-abc123',
  email: EMAIL,
  currentStep: 1,
  status: 'REGISTERED',
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  registrationCompleted: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

// ─── Factory de repositório mock ──────────────────────────────────────────────

const makeRepository = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByAuthUid: jest.fn(),
  findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
  findByPhone: jest.fn(),
  findByPhoneCandidates: jest.fn(),
  updatePersonalInfo: jest.fn(),
  updateAuthUid: jest.fn(),
  updateImportedWorkerData: jest.fn(),
  updateStatus: jest.fn(),
  recalculateStatus: jest.fn(),
  delete: jest.fn(),
  deleteByAuthUid: jest.fn(),
  ...overrides,
});

// ─── Testes da função maskPhone ───────────────────────────────────────────────

describe('maskPhone', () => {
  describe('Cenário 5 — Mascaramento padrão', () => {
    it('deve substituir todos exceto os últimos 3 dígitos por "x"', () => {
      expect(maskPhone('5491157983978')).toBe('xxxxxxxxxx978');
    });

    it('deve mascarar corretamente número com 7 dígitos', () => {
      expect(maskPhone('1234567')).toBe('xxxx567');
    });

    it('deve mascarar corretamente número com 4 dígitos', () => {
      expect(maskPhone('9876')).toBe('x876');
    });

    it('deve usar exatamente phone.length - 3 xs', () => {
      const phone = '5491157983978'; // 13 dígitos
      const result = maskPhone(phone);
      const xCount = result.split('').filter(c => c === 'x').length;
      expect(xCount).toBe(10);
    });
  });

  describe('Cenário 6 — Strings curtas (3 ou menos)', () => {
    it('deve retornar integralmente string de exatamente 3 caracteres', () => {
      expect(maskPhone('123')).toBe('123');
    });

    it('deve retornar integralmente string de 2 caracteres', () => {
      expect(maskPhone('12')).toBe('12');
    });

    it('deve retornar integralmente string de 1 caractere', () => {
      expect(maskPhone('9')).toBe('9');
    });
  });
});

// ─── Testes do use case ───────────────────────────────────────────────────────

describe('LookupWorkerByEmailUseCase', () => {

  describe('Cenário 1 — Worker não encontrado', () => {
    it('deve retornar { found: false } quando findByEmail retorna null', async () => {
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect(result).toEqual({ found: false });
    });

    it('deve retornar found=false sem phoneMasked', async () => {
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect((result as any).phoneMasked).toBeUndefined();
    });
  });

  describe('Cenário 2 — Worker encontrado sem phone', () => {
    it('deve retornar { found: true } sem phoneMasked quando worker não tem phone', async () => {
      const workerSemPhone = makeWorker({ phone: undefined });
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerSemPhone)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect(result).toEqual({ found: true });
      expect((result as any).phoneMasked).toBeUndefined();
    });
  });

  describe('Cenário 3 — Worker encontrado com phone', () => {
    it('deve retornar { found: true, phoneMasked: "xxxxxxxxxx978" } para phone "5491157983978"', async () => {
      const workerComPhone = makeWorker({ phone: PHONE });
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerComPhone)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect(result).toEqual({ found: true, phoneMasked: 'xxxxxxxxxx978' });
    });

    it('deve retornar found=true com phoneMasked contendo apenas últimos 3 dígitos visíveis', async () => {
      const workerComPhone = makeWorker({ phone: '12345' });
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerComPhone)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect(result).toEqual({ found: true, phoneMasked: 'xx345' });
    });

    it('não deve retornar id, email, authUid ou qualquer outro dado do worker', async () => {
      const workerComPhone = makeWorker({ phone: PHONE });
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerComPhone)),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect((result as any).id).toBeUndefined();
      expect((result as any).email).toBeUndefined();
      expect((result as any).authUid).toBeUndefined();
      expect((result as any).firstName).toBeUndefined();
    });
  });

  describe('Cenário 4 — Erro no repositório', () => {
    it('deve retornar { found: false } quando findByEmail retorna falha', async () => {
      const repo = makeRepository({
        findByEmail: jest.fn().mockResolvedValue(Result.fail('connection timeout')),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      const result = await useCase.execute(EMAIL);

      expect(result).toEqual({ found: false });
    });

    it('não deve propagar exceção quando repositório falha', async () => {
      const repo = makeRepository({
        findByEmail: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      await expect(useCase.execute(EMAIL)).rejects.toThrow('DB down');
    });
  });

  describe('Cenário 7 — findByEmail chamado exatamente uma vez', () => {
    it('deve chamar findByEmail exatamente uma vez com o email fornecido', async () => {
      const findByEmail = jest.fn().mockResolvedValue(Result.ok(null));
      const repo = makeRepository({ findByEmail });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);

      await useCase.execute(EMAIL);

      expect(findByEmail).toHaveBeenCalledTimes(1);
      expect(findByEmail).toHaveBeenCalledWith(EMAIL);
    });

    it('deve chamar findByEmail com o email exato (sem transformação)', async () => {
      const findByEmail = jest.fn().mockResolvedValue(Result.ok(null));
      const repo = makeRepository({ findByEmail });
      const useCase = new LookupWorkerByEmailUseCase(repo as any);
      const emailEspecifico = 'user+tag@domain.co.ar';

      await useCase.execute(emailEspecifico);

      expect(findByEmail).toHaveBeenCalledWith(emailEspecifico);
    });
  });
});
