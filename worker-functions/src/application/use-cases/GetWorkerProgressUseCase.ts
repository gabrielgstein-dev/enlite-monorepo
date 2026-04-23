import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker } from '../../domain/entities/Worker';
import { Result } from '@shared/utils/Result';

export class GetWorkerProgressUseCase {
  constructor(private workerRepository: IWorkerRepository) {}

  async execute(authUid: string): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findByAuthUid(authUid);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    return Result.ok<Worker>(worker);
  }
}
