import { SaveAvailabilityUseCase } from '../SaveAvailabilityUseCase';
import { Result } from '../../../domain/shared/Result';

const mockWorker = {
  id: 'worker-123',
  authUid: 'auth-123',
  email: 'test@example.com',
  currentStep: 1,
  status: 'INCOMPLETE_REGISTER',
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  registrationCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeWorkerRepo = (overrides = {}) => ({
  findById: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  updateStep: jest.fn().mockResolvedValue(Result.ok({ ...mockWorker, currentStep: 5, status: 'REGISTERED' })),
  findByAuthUid: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  updatePersonalInfo: jest.fn(),
  updateStatus: jest.fn(),
  updateAuthUid: jest.fn(),
  findByPhone: jest.fn(),
  delete: jest.fn(),
  deleteByAuthUid: jest.fn(),
  recalculateStatus: jest.fn().mockResolvedValue(null),
  ...overrides,
});

const makeAvailabilityRepo = (overrides = {}) => ({
  deleteByWorkerId: jest.fn().mockResolvedValue(Result.ok(undefined)),
  createBatch: jest.fn().mockResolvedValue(Result.ok([])),
  findByWorkerId: jest.fn(),
  ...overrides,
});

const availabilityPayload = {
  workerId: 'worker-123',
  availability: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
    { dayOfWeek: 5, startTime: '14:00', endTime: '18:00' },
  ],
};

describe('SaveAvailabilityUseCase', () => {
  describe('sucesso', () => {
    it('deve deletar slots anteriores e criar novos', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute(availabilityPayload);

      expect(result.isFailure).toBe(false);
      expect(availabilityRepo.deleteByWorkerId).toHaveBeenCalledWith('worker-123');
      expect(availabilityRepo.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ workerId: 'worker-123', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }),
          expect.objectContaining({ workerId: 'worker-123', dayOfWeek: 3 }),
          expect.objectContaining({ workerId: 'worker-123', dayOfWeek: 5 }),
        ])
      );
    });

    it('NÃO deve chamar updateStep — sem avanço de step na edição por abas', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute(availabilityPayload);

      expect(workerRepo.updateStep).not.toHaveBeenCalled();
    });

    it('deve incluir timezone do worker em cada slot', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute(availabilityPayload);

      const batchArg = availabilityRepo.createBatch.mock.calls[0][0];
      expect(batchArg[0].timezone).toBe('America/Argentina/Buenos_Aires');
      expect(batchArg[1].timezone).toBe('America/Argentina/Buenos_Aires');
    });

    it('deve definir crossesMidnight como false por padrão', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute(availabilityPayload);

      const batchArg = availabilityRepo.createBatch.mock.calls[0][0];
      batchArg.forEach((slot: any) => {
        expect(slot.crossesMidnight).toBe(false);
      });
    });

    it('deve respeitar crossesMidnight quando informado', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute({
        workerId: 'worker-123',
        availability: [{ dayOfWeek: 6, startTime: '22:00', endTime: '02:00', crossesMidnight: true }],
      });

      const batchArg = availabilityRepo.createBatch.mock.calls[0][0];
      expect(batchArg[0].crossesMidnight).toBe(true);
    });

    it('deve retornar o worker original (sem status review forçado)', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute(availabilityPayload);

      expect(result.isFailure).toBe(false);
      // status deve ser INCOMPLETE_REGISTER (do worker original), não REGISTERED
      expect(result.getValue()?.status).toBe('INCOMPLETE_REGISTER');
    });
  });

  describe('validação: lista vazia', () => {
    it('deve falhar se availability estiver vazia', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute({ workerId: 'worker-123', availability: [] });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('At least one availability slot is required');
      expect(availabilityRepo.deleteByWorkerId).not.toHaveBeenCalled();
    });
  });

  describe('worker não encontrado', () => {
    it('deve falhar se worker não existe', async () => {
      const workerRepo = makeWorkerRepo({
        findById: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute(availabilityPayload);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Worker not found');
      expect(availabilityRepo.createBatch).not.toHaveBeenCalled();
    });
  });

  describe('timezone fallback', () => {
    it('deve usar UTC quando worker.timezone é nulo', async () => {
      const workerRepo = makeWorkerRepo({
        findById: jest.fn().mockResolvedValue(Result.ok({ ...mockWorker, timezone: null })),
      });
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute(availabilityPayload);

      const batchArg = availabilityRepo.createBatch.mock.calls[0][0];
      batchArg.forEach((slot: any) => {
        expect(slot.timezone).toBe('UTC');
      });
    });
  });

  describe('falha no repositório', () => {
    it('deve propagar erro do deleteByWorkerId', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo({
        deleteByWorkerId: jest.fn().mockResolvedValue(Result.fail('Delete failed')),
      });
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute(availabilityPayload);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Delete failed');
      expect(availabilityRepo.createBatch).not.toHaveBeenCalled();
    });

    it('deve propagar erro do createBatch', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo({
        createBatch: jest.fn().mockResolvedValue(Result.fail('DB insert error')),
      });
      const useCase = new SaveAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute(availabilityPayload);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('DB insert error');
      expect(workerRepo.updateStep).not.toHaveBeenCalled();
    });
  });
});
