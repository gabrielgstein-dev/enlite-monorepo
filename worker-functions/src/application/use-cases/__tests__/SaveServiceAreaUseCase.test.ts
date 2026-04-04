import { SaveServiceAreaUseCase } from '../SaveServiceAreaUseCase';
import { Result } from '../../../domain/shared/Result';

const mockWorker = {
  id: 'worker-123',
  authUid: 'auth-123',
  email: 'test@example.com',
  currentStep: 1,
  status: 'INCOMPLETE_REGISTER',
  country: 'AR',
  timezone: 'UTC',
  registrationCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockServiceArea = {
  id: 'sa-1',
  workerId: 'worker-123',
  address: 'Av. Corrientes 1234, Buenos Aires',
  lat: -34.603722,
  lng: -58.381592,
  serviceRadiusKm: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeWorkerRepo = (overrides = {}) => ({
  findById: jest.fn().mockResolvedValue(Result.ok(mockWorker)),
  updateStep: jest.fn().mockResolvedValue(Result.ok({ ...mockWorker, currentStep: 4 })),
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

const makeServiceAreaRepo = (overrides = {}) => ({
  deleteByWorkerId: jest.fn().mockResolvedValue(Result.ok(undefined)),
  create: jest.fn().mockResolvedValue(Result.ok(mockServiceArea)),
  findByWorkerId: jest.fn(),
  ...overrides,
});

const serviceAreaPayload = {
  workerId: 'worker-123',
  address: 'Av. Corrientes 1234, Buenos Aires',
  addressComplement: 'Piso 3',
  serviceRadiusKm: 10,
  lat: -34.603722,
  lng: -58.381592,
};

describe('SaveServiceAreaUseCase', () => {
  describe('sucesso', () => {
    it('deve deletar área anterior e criar nova', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      const result = await useCase.execute(serviceAreaPayload);

      expect(result.isFailure).toBe(false);
      expect(serviceAreaRepo.deleteByWorkerId).toHaveBeenCalledWith('worker-123');
      expect(serviceAreaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'worker-123',
          address: 'Av. Corrientes 1234, Buenos Aires',
          serviceRadiusKm: 10,
          lat: -34.603722,
          lng: -58.381592,
        })
      );
    });

    it('NÃO deve chamar updateStep — sem avanço de step na edição por abas', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      await useCase.execute(serviceAreaPayload);

      expect(workerRepo.updateStep).not.toHaveBeenCalled();
    });

    it('deve retornar o worker original (não o de updateStep)', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      const result = await useCase.execute(serviceAreaPayload);

      expect(result.isFailure).toBe(false);
      const returnedWorker = result.getValue();
      // currentStep deve permanecer 1 (não avançar para 4)
      expect(returnedWorker.currentStep).toBe(1);
    });

    it('deve aceitar endereço sem complemento', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      const result = await useCase.execute({
        workerId: 'worker-123',
        address: 'Rua sem complemento',
        serviceRadiusKm: 5,
        lat: -34.0,
        lng: -58.0,
      });

      expect(result.isFailure).toBe(false);
    });

    it('deve garantir upsert: salvar 2x gera apenas 1 registro (delete + insert)', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      await useCase.execute(serviceAreaPayload);
      await useCase.execute({ ...serviceAreaPayload, serviceRadiusKm: 20 });

      // deleteByWorkerId deve ter sido chamado nas 2 saves
      expect(serviceAreaRepo.deleteByWorkerId).toHaveBeenCalledTimes(2);
      expect(serviceAreaRepo.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('worker não encontrado', () => {
    it('deve falhar se worker não existe', async () => {
      const workerRepo = makeWorkerRepo({
        findById: jest.fn().mockResolvedValue(Result.ok(null)),
      });
      const serviceAreaRepo = makeServiceAreaRepo();
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      const result = await useCase.execute(serviceAreaPayload);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Worker not found');
      expect(serviceAreaRepo.deleteByWorkerId).not.toHaveBeenCalled();
      expect(serviceAreaRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('falha no repositório de área', () => {
    it('deve propagar erro do create', async () => {
      const workerRepo = makeWorkerRepo();
      const serviceAreaRepo = makeServiceAreaRepo({
        create: jest.fn().mockResolvedValue(Result.fail('Failed to create service area')),
      });
      const useCase = new SaveServiceAreaUseCase(workerRepo as any, serviceAreaRepo as any);

      const result = await useCase.execute(serviceAreaPayload);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Failed to create service area');
      expect(workerRepo.updateStep).not.toHaveBeenCalled();
    });
  });
});
