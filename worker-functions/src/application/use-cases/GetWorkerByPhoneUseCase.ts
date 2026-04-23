import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { generatePhoneCandidates } from '../../infrastructure/utils/phoneNormalization';

export class GetWorkerByPhoneUseCase {
  constructor(private workerRepository: IWorkerRepository) {}

  async execute(phone: string): Promise<Result<Worker>> {
    const candidates = generatePhoneCandidates(phone);

    if (candidates.length === 0) {
      return Result.fail<Worker>('Phone number is required');
    }

    const workerResult = await this.workerRepository.findByPhoneCandidates(candidates);

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
