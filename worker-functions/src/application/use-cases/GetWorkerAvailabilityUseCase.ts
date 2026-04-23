import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IAvailabilityRepository } from '../../domain/repositories/IAvailabilityRepository';
import { WorkerAvailability } from '../../domain/entities/WorkerAvailability';
import { Result } from '@shared/utils/Result';

export class GetWorkerAvailabilityUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private availabilityRepository: IAvailabilityRepository,
  ) {}

  async execute(workerId: string): Promise<Result<WorkerAvailability[]>> {
    const workerResult = await this.workerRepository.findById(workerId);

    if (workerResult.isFailure) {
      return Result.fail<WorkerAvailability[]>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<WorkerAvailability[]>('Worker not found');
    }

    return this.availabilityRepository.findByWorkerId(workerId);
  }
}
