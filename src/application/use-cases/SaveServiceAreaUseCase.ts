import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IServiceAreaRepository } from '../../domain/repositories/IServiceAreaRepository';
import { SaveServiceAreaDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class SaveServiceAreaUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private serviceAreaRepository: IServiceAreaRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(data: SaveServiceAreaDTO): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findById(data.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    await this.serviceAreaRepository.deleteByWorkerId(data.workerId);

    const createResult = await this.serviceAreaRepository.create({
      workerId: data.workerId,
      address: data.address,
      addressComplement: data.addressComplement,
      serviceRadiusKm: data.serviceRadiusKm,
      lat: data.lat,
      lng: data.lng,
    });

    if (createResult.isFailure) {
      return Result.fail<Worker>(createResult.error!);
    }

    const stepUpdateResult = await this.workerRepository.updateStep({
      workerId: data.workerId,
      step: 4,
      status: 'in_progress',
    });

    if (stepUpdateResult.isFailure) {
      return stepUpdateResult;
    }

    const updatedWorker = stepUpdateResult.getValue();

    await this.eventDispatcher.notifyStepCompleted(data.workerId, 3, {
      address: data.address,
      radiusKm: data.serviceRadiusKm,
    });

    return Result.ok<Worker>(updatedWorker);
  }
}
