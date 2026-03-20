import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IAvailabilityRepository } from '../../domain/repositories/IAvailabilityRepository';
import { SaveAvailabilityDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class SaveAvailabilityUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private availabilityRepository: IAvailabilityRepository,
    private eventDispatcher: EventDispatcher
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

    // Mark registration as completed since this is the final step (step 3)
    // The updateStep method will automatically set registration_completed = true when step >= 5
    const stepUpdateResult = await this.workerRepository.updateStep({
      workerId: data.workerId,
      step: 5,
      status: 'review',
    });

    if (stepUpdateResult.isFailure) {
      return stepUpdateResult;
    }

    const updatedWorker = stepUpdateResult.getValue();

    await this.eventDispatcher.notifyStepCompleted(data.workerId, 4, {
      slotsCount: data.availability.length,
    });

    await this.eventDispatcher.notifyStatusChanged(data.workerId, 'review');

    return Result.ok<Worker>(updatedWorker);
  }
}
