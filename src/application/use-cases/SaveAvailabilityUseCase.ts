import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IAvailabilityRepository } from '../../domain/repositories/IAvailabilityRepository';
import { SaveAvailabilityDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
export class SaveAvailabilityUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private availabilityRepository: IAvailabilityRepository,
  ) {}

  async execute(data: SaveAvailabilityDTO): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findById(data.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    if (data.availability.length === 0) {
      return Result.fail<Worker>('At least one availability slot is required');
    }

    await this.availabilityRepository.deleteByWorkerId(data.workerId);

    const createResult = await this.availabilityRepository.createBatch(
      data.availability.map(slot => ({
        workerId: data.workerId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        timezone: worker.timezone,
        crossesMidnight: slot.crossesMidnight || false,
      }))
    );

    if (createResult.isFailure) {
      return Result.fail<Worker>(createResult.error!);
    }

    return Result.ok<Worker>(worker);
  }
}
