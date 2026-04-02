import { GetWorkerAvailabilityUseCase } from '../GetWorkerAvailabilityUseCase';
import { Result } from '../../../domain/shared/Result';

const mockWorker = {
  id: 'worker-123',
  authUid: 'auth-123',
  email: 'test@example.com',
  currentStep: 1,
  status: 'REGISTERED',
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  registrationCompleted: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAvailability = [
  {
    id: 'avail-1',
    workerId: 'worker-123',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'America/Argentina/Buenos_Aires',
    crossesMidnight: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'avail-2',
    workerId: 'worker-123',
    dayOfWeek: 3,
    startTime: '08:00',
    endTime: '12:00',
    timezone: 'America/Argentina/Buenos_Aires',
    crossesMidnight: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const makeWorkerRepo = (overrides = {}) => ({
  findById: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  findByAuthUid: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  updateStep: jest.fn(),
  updatePersonalInfo: jest.fn(),
  updateStatus: jest.fn(),
  updateAuthUid: jest.fn(),
  findByPhone: jest.fn(),
  delete: jest.fn(),
  deleteByAuthUid: jest.fn(),
  ...overrides,
});

const makeAvailabilityRepo = (overrides = {}) => ({
  findByWorkerId: jest.fn().mockResolvedValue(Result.ok(mockAvailability)),
  deleteByWorkerId: jest.fn(),
  createBatch: jest.fn(),
  create: jest.fn(),
  ...overrides,
});

describe('GetWorkerAvailabilityUseCase', () => {
  describe('sucesso', () => {
    it('deve retornar os slots de disponibilidade do worker', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute('worker-123');

      expect(result.isFailure).toBe(false);
      const slots = result.getValue();
      expect(slots).toHaveLength(2);
      expect(slots![0].dayOfWeek).toBe(1);
      expect(slots![1].dayOfWeek).toBe(3);
    });

    it('deve chamar findByWorkerId com o workerId correto', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      await useCase.execute('worker-123');

      expect(availabilityRepo.findByWorkerId).toHaveBeenCalledWith('worker-123');
    });

    it('deve retornar lista vazia quando worker não tem disponibilidade cadastrada', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo({
        findByWorkerId: jest.fn().mockResolvedValue(Result.ok([])),
      });
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute('worker-123');

      expect(result.isFailure).toBe(false);
      expect(result.getValue()).toEqual([]);
    });
  });

  describe('worker não encontrado', () => {
    it('deve falhar se worker não existe', async () => {
      const workerRepo = makeWorkerRepo({
        findById: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute('worker-999');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Worker not found');
      expect(availabilityRepo.findByWorkerId).not.toHaveBeenCalled();
    });
  });

  describe('falha no repositório', () => {
    it('deve propagar erro do workerRepository', async () => {
      const workerRepo = makeWorkerRepo({
        findById: jest.fn().mockResolvedValue(Result.fail('DB connection error')),
      });
      const availabilityRepo = makeAvailabilityRepo();
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute('worker-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('DB connection error');
    });

    it('deve propagar erro do availabilityRepository', async () => {
      const workerRepo = makeWorkerRepo();
      const availabilityRepo = makeAvailabilityRepo({
        findByWorkerId: jest.fn().mockResolvedValue(Result.fail('Query failed')),
      });
      const useCase = new GetWorkerAvailabilityUseCase(workerRepo as any, availabilityRepo as any);

      const result = await useCase.execute('worker-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Query failed');
    });
  });
});
