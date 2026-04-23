import { IWorkerRepository } from '../ports/IWorkerRepository';
import { IAvailabilityRepository } from '../ports/IAvailabilityRepository';
import { WorkerAvailability } from '../domain/WorkerAvailability';
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
