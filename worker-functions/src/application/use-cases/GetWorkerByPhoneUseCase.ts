import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';

export class GetWorkerByPhoneUseCase {
  constructor(private workerRepository: IWorkerRepository) {}

  async execute(phone: string): Promise<Result<Worker>> {
    const normalizedPhone = phone.replace(/\D/g, '');

    if (!normalizedPhone) {
      return Result.fail<Worker>('Phone number is required');
    }

    const workerResult = await this.workerRepository.findByPhone(normalizedPhone);

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
