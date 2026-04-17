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
  status: 'INCOMPLETE_REGISTER',
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

    it('deve chamar create com os dados corretos incluindo lgpdOptIn e whatsappPhone', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);
      const dto = makeCreateDTO({ lgpdOptIn: true, whatsappPhone: '+5411234567890' });

      await useCase.execute(dto);

      expect(repo.create).toHaveBeenCalledWith({
        authUid: dto.authUid,
        email: dto.email,
        phone: dto.phone,
        whatsappPhone: '+5411234567890',
        lgpdOptIn: true,
        country: dto.country,
      });
    });

    it('deve chamar create com lgpdOptIn e whatsappPhone undefined quando não fornecidos', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);
      const dto = makeCreateDTO();

      await useCase.execute(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authUid: dto.authUid,
          email: dto.email,
          phone: dto.phone,
          lgpdOptIn: undefined,
          whatsappPhone: undefined,
          country: dto.country,
        })
      );
    });

    it('deve persistir lgpdOptIn=false quando enviado explicitamente como false', async () => {
      const repo = makeRepository();
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO({ lgpdOptIn: false }));

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ lgpdOptIn: false })
      );
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
        REAL_AUTH_UID,
        undefined,
        undefined, // lgpdOptIn não fornecido → consentAt undefined
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

    it('deve passar consentAt quando lgpdOptIn=true na reconexão por email', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO({ lgpdOptIn: true }));

      const call = repo.updateAuthUid.mock.calls[0];
      // 4th argument is consentAt
      expect(call[3]).toBeInstanceOf(Date);
    });

    it('NÃO deve passar consentAt quando lgpdOptIn=false na reconexão por email', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithOldAuthUid)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO({ lgpdOptIn: false }));

      const call = repo.updateAuthUid.mock.calls[0];
      expect(call[3]).toBeUndefined();
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
          { authUid: REAL_AUTH_UID, email: REAL_EMAIL, consentAt: undefined }
        );
        expect(repo.create).not.toHaveBeenCalled();
      }
    );

    it('deve propagar erro quando updateImportedWorkerData falha', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorkerAnacare)),
        updateImportedWorkerData: jest.fn().mockResolvedValue(
          Result.fail('Constraint violation: duplicate auth_uid')
        ),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Constraint violation: duplicate auth_uid');
      expect(repo.create).not.toHaveBeenCalled();
      expect(dispatcher.notifyWorkerCreated).not.toHaveBeenCalled();
    });

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

    it('deve passar consentAt quando lgpdOptIn=true ao migrar worker importado', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorkerAnacare)),
        updateImportedWorkerData: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO({ lgpdOptIn: true }));

      const call = repo.updateImportedWorkerData.mock.calls[0];
      expect(call[1].consentAt).toBeInstanceOf(Date);
    });

    it('NÃO deve passar consentAt quando lgpdOptIn=false ao migrar worker importado', async () => {
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(importedWorkerAnacare)),
        updateImportedWorkerData: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      await useCase.execute(makeCreateDTO({ lgpdOptIn: false }));

      const call = repo.updateImportedWorkerData.mock.calls[0];
      expect(call[1].consentAt).toBeUndefined();
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

  describe('Cenário 10 — Preservação do phone do worker existente', () => {
    const EXISTING_PHONE = '+5491157983978';
    const PAYLOAD_PHONE = '+5491199990000';

    it('worker existente COM phone: o phone original deve ser preservado após reconexão por email', async () => {
      // Worker já está no banco com phone definido
      const workerWithPhone: Worker = {
        ...mockWorker,
        authUid: 'oldAuthUid111',
        phone: EXISTING_PHONE,
        id: 'f1a2b3c4-0001-4000-a000-000000000001',
      };
      // updateAuthUid retorna o worker com authUid novo, mas phone inalterado
      const updatedWorker: Worker = {
        ...workerWithPhone,
        authUid: REAL_AUTH_UID,
        phone: EXISTING_PHONE, // phone NÃO deve ser sobrescrito
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithPhone)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(updatedWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      // Payload traz phone DIFERENTE do que está no banco
      const result = await useCase.execute(makeCreateDTO({ phone: PAYLOAD_PHONE }));

      expect(result.isSuccess).toBe(true);
      // Worker JÁ tem phone → phoneToSet = undefined; lgpdOptIn não fornecido → consentAt = undefined
      expect(repo.updateAuthUid).toHaveBeenCalledWith(workerWithPhone.id, REAL_AUTH_UID, undefined, undefined);
      expect(repo.updateAuthUid).toHaveBeenCalledTimes(1);
      // O phone retornado deve ser o do banco, não o do payload
      expect(result.getValue().phone).toBe(EXISTING_PHONE);
    });

    it('worker existente SEM phone: o phone do payload deve preencher após reconexão por email', async () => {
      const workerWithoutPhone: Worker = {
        ...mockWorker,
        authUid: 'oldAuthUid222',
        phone: undefined,
        id: 'f1a2b3c4-0002-4000-a000-000000000002',
      };
      const updatedWorker: Worker = {
        ...workerWithoutPhone,
        authUid: REAL_AUTH_UID,
        phone: PAYLOAD_PHONE, // phone preenchido com o do payload
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(workerWithoutPhone)),
        updateAuthUid: jest.fn().mockResolvedValue(Result.ok(updatedWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO({ phone: PAYLOAD_PHONE }));

      expect(result.isSuccess).toBe(true);
      // Worker sem phone → phoneToSet = PAYLOAD_PHONE; lgpdOptIn não fornecido → consentAt = undefined
      expect(repo.updateAuthUid).toHaveBeenCalledWith(workerWithoutPhone.id, REAL_AUTH_UID, PAYLOAD_PHONE, undefined);
      expect(result.getValue().phone).toBe(PAYLOAD_PHONE);
    });

    it('worker NOVO: phone do payload deve ser gravado normalmente', async () => {
      const NEW_PHONE = '+5491177778888';
      const createdWorker: Worker = {
        ...mockWorker,
        authUid: REAL_AUTH_UID,
        phone: NEW_PHONE,
        id: 'f1a2b3c4-0003-4000-a000-000000000003',
      };
      const repo = makeRepository({
        findByAuthUid: jest.fn().mockResolvedValue(Result.ok(null)),
        findByEmail: jest.fn().mockResolvedValue(Result.ok(null)),
        findByPhone: jest.fn().mockResolvedValue(Result.ok(null)),
        create: jest.fn().mockResolvedValue(Result.ok(createdWorker)),
      });
      const dispatcher = makeEventDispatcher();
      const useCase = new InitWorkerUseCase(repo as any, dispatcher as any);

      const result = await useCase.execute(makeCreateDTO({ phone: NEW_PHONE }));

      expect(result.isSuccess).toBe(true);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: NEW_PHONE })
      );
      expect(result.getValue().phone).toBe(NEW_PHONE);
    });
  });

  describe('Cenário 11 — Erro no create', () => {
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

  describe('Cenário 12 — notifyWorkerCreated apenas na criação de worker novo', () => {
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
