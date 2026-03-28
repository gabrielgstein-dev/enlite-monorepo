import { InitWorkerUseCase } from '../InitWorkerUseCase';
import { Result } from '../../../domain/shared/Result';
import { Worker } from '../../../domain/entities/Worker';

// ─── Dados de teste realistas ────────────────────────────────────────────────

const REAL_AUTH_UID = 'abc123XYZ789def';
const REAL_EMAIL = 'joana.silva@gmail.com';
const REAL_PHONE = '+5511998887766';
const WORKER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const IMPORTED_AUTH_UID_ANACARE = 'anacareimport_+5411999887766';
const IMPORTED_AUTH_UID_CANDIDATO = 'candidatoimport_+5411999887766';
const IMPORTED_AUTH_UID_PRETALN = 'pretalnimport_+5411999887766';

const mockWorker: Worker = {
  id: WORKER_ID,
  authUid: REAL_AUTH_UID,
  email: REAL_EMAIL,
  phone: REAL_PHONE,
  currentStep: 1,
  status: 'pending',
  country: 'BR',
  timezone: 'America/Sao_Paulo',
  registrationCompleted: false,
  createdAt: new Date('2024-06-01T10:00:00Z'),
  updatedAt: new Date('2024-06-01T10:00:00Z'),
};

// ─── Factories de mock ────────────────────────────────────────────────────────

const makeRepository = (overrides = {}) => ({
  findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
  findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
  findByPhone: jest.fn().mockResolvedValue(Result.ok(null)),
  create: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  updateAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  updateImportedWorkerData: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  // métodos da interface presentes mas não utilizados neste use case
  findById: jest.fn(),
  updatePersonalInfo: jest.fn(),
  updateStep: jest.fn(),
  delete: jest.fn(),
  deleteByAuthUid: jest.fn(),
  ...overrides,
});

const makeEventDispatcher = () => ({
  notifyWorkerCreated: jest.fn().mockResolvedValue(undefined),
  notifyStepCompleted: jest.fn(),
  notifyStatusChanged: jest.fn(),
  notifyWorkerUpdated: jest.fn(),
  notifyWorkerDeleted: jest.fn(),
});

const makeCreateDTO = (overrides = {}) => ({
  authUid: REAL_AUTH_UID,
  email: REAL_EMAIL,
  phone: REAL_PHONE,
  country: 'BR',
  ...overrides,
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('InitWorkerUseCase', () => {

  describe('Cenário 1 — Worker novo (nenhum registro existe)', () => {
    it('deve criar worker e retornar Result.ok com o worker criado', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockWorker);
    });

    it('deve chamar create com os dados corretos', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);
      const dto = makeCreateDTO();

      await useCase.execute(dto);

      expect(repo.create).toHaveBeenCalledWith({
        authUid: dto.authUid,
        email: dto.email,
        phone: dto.phone,
        country: dto.country,
      });
    });
  });

  describe('Cenário 2 — AuthUid já existe (idempotência)', () => {
    it('deve retornar worker existente sem chamar create', async () => {
      const existingWorker = { ...mockWorker };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(existingWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(existingWorker);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.findByEmail).not.toHaveBeenCalled();
    });

    it('não deve chamar notifyWorkerCreated quando authUid já existe', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 3 — Email existe com authUid diferente (reconexão Google Identity)', () => {
    const workerWithOldAuthUid: Worker = {
      ...mockWorker,
      authUid: 'oldAuthUidFromPreviousAccount',
      id: 'e3d4f5a6-7890-4b12-8c34-56d78e90f123',
    };

    it('deve chamar updateAuthUid com o id do worker existente e o novo authUid', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
        updateAuthUid: jest.fn().mockResolvedValue(
          Result.ok({ ...workerWithOldAuthUid, authUid: REAL_AUTH_UID })
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isSuccess).toBe(true);
      expect(repo.updateAuthUid).toHaveBeenCalledWith(
        workerWithOldAuthUid.id,
        REAL_AUTH_UID
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('deve retornar worker com authUid atualizado', async () => {
      const updatedWorker = { ...workerWithOldAuthUid, authUid: REAL_AUTH_UID };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(updatedWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.getValue().authUid).toBe(REAL_AUTH_UID);
    });

    it('não deve chamar notifyWorkerCreated na reconexão por email', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 4 — Email existe com mesmo authUid', () => {
    it('deve retornar worker existente sem chamar updateAuthUid nem create', async () => {
      const existingWorker: Worker = { ...mockWorker };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(existingWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(existingWorker);
      expect(repo.updateAuthUid).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 5 — Worker importado por telefone (migração)', () => {
    const importedWorkerAnacare: Worker = {
      ...mockWorker,
      authUid: IMPORTED_AUTH_UID_ANACARE,
      email: 'importado@anacareimport.invalid',
      id: 'a1b2c3d4-1234-4abc-8def-9876543210ab',
    };

    const importedWorkerCandidato: Worker = {
      ...mockWorker,
      authUid: IMPORTED_AUTH_UID_CANDIDATO,
      email: 'importado@candidatoimport.invalid',
      id: 'b2c3d4e5-2345-4bcd-9ef0-0987654321bc',
    };

    const importedWorkerPretaln: Worker = {
      ...mockWorker,
      authUid: IMPORTED_AUTH_UID_PRETALN,
      email: 'importado@pretalnimport.invalid',
      id: 'c3d4e5f6-3456-4cde-a012-1098765432cd',
    };

    it.each([
      ['anacareimport_', importedWorkerAnacare],
      ['candidatoimport_', importedWorkerCandidato],
      ['pretalnimport_', importedWorkerPretaln],
    ])(
      'deve chamar updateImportedWorkerData quando authUid começa com %s',
      async (_, importedWorker) => {
        const repo = makeRepository({
          findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
          findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
          findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorker)),
          updateImportedWorkerData: jest.fn().mockResolvedValue(
            Result.ok({ ...importedWorker, authUid: REAL_AUTH_UID, email: REAL_EMAIL })
          ),
        });
        const dispatcher = makeEventDispatcher();
        const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

        const result = await useCase.execute(makeCreateDTO());

        expect(result.isSuccess).toBe(true);
        expect(repo.updateImportedWorkerData).toHaveBeenCalledWith(
          importedWorker.id,
          { authUid: REAL_AUTH_UID, email: REAL_EMAIL }
        );
        expect(repo.create).not.toHaveBeenCalled();
      }
    );

    it('não deve chamar notifyWorkerCreated ao migrar worker importado', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorkerAnacare)),
        updateImportedWorkerData: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 6 — Worker por telefone mas NÃO importado (authUid real)', () => {
    it('não deve migrar — deve criar novo worker ignorando o existente por telefone', async () => {
      const realWorkerByPhone: Worker = {
        ...mockWorker,
        authUid: 'xyzAnotherRealUid999',
        email: 'outro.usuario@gmail.com',
        id: 'd4e5f6a7-4567-4def-b123-2109876543de',
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(realWorkerByPhone)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(repo.updateImportedWorkerData).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('Cenário 7 — Erro no findByAuthUid', () => {
    it('deve propagar o erro sem chamar outros métodos', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(
          Result.fail('Erro de conexão com o banco: timeout')
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Erro de conexão com o banco: timeout');
      expect(repo.findByEmail).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 8 — Erro no findByEmail', () => {
    it('deve propagar o erro sem chamar create', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(
          Result.fail('Query inválida: coluna email não existe')
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Query inválida: coluna email não existe');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 9 — Erro no updateAuthUid', () => {
    it('deve propagar o erro do repositório ao tentar reconciliar authUid', async () => {
      const workerWithDifferentUid: Worker = {
        ...mockWorker,
        authUid: 'uid-anterior-do-firebase',
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithDifferentUid)),
        updateAuthUid: jest.fn().mockResolvedValue(
          Result.fail('Falha ao atualizar authUid: constraint violation')
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Falha ao atualizar authUid: constraint violation');
      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 10 — Erro no create', () => {
    it('deve propagar o erro sem chamar notifyWorkerCreated', async () => {
      const repo = makeRepository({
        create: jest.fn().mockResolvedValue(
          Result.fail('INSERT falhou: duplicate key value violates unique constraint')
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate key');
      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 11 — notifyWorkerCreated apenas na criação de worker novo', () => {
    it('deve chamar notifyWorkerCreated com o id e email do worker criado', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).toHaveBeenCalledTimes(1);
      expect(dispatcher.notifyWorkerCreated).toHaveBeenCalledWith(
        mockWorker.id,
        { email: mockWorker.email }
      );
    });

    it('NÃO deve chamar notifyWorkerCreated quando authUid já existe', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });

    it('NÃO deve chamar notifyWorkerCreated quando reconecta por email (updateAuthUid)', async () => {
      const workerWithOldUid = { ...mockWorker, authUid: 'uidAntigo456' };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldUid)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });

    it('NÃO deve chamar notifyWorkerCreated quando migra worker importado por telefone', async () => {
      const importedWorker: Worker = {
        ...mockWorker,
        authUid: IMPORTED_AUTH_UID_ANACARE,
        email: 'joana@anacareimport.invalid',
        id: 'e5f6a7b8-5678-4efg-c234-3210987654ef',
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorker)),
        updateImportedWorkerData: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO());

      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });
  });
});
