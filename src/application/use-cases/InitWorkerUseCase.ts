import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { CreateWorkerDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class InitWorkerUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(data: CreateWorkerDTO): Promise<Result<Worker>> {
    const existingWorkerResult = await this.workerRepository.findByAuthUid(data.authUid);
    
    if (existingWorkerResult.isFailure) {
      return Result.fail<Worker>(existingWorkerResult.error!);
    }

    if (existingWorkerResult.getValue() !== null) {
      return Result.ok<Worker>(existingWorkerResult.getValue()!);
    }

    const emailCheckResult = await this.workerRepository.findByEmail(data.email);
    
    if (emailCheckResult.isFailure) {
      return Result.fail<Worker>(emailCheckResult.error!);
    }

    if (emailCheckResult.getValue() !== null) {
      return Result.fail<Worker>('Email already registered');
    }

    const createResult = await this.workerRepository.create({
      authUid: data.authUid,
      email: data.email,
      phone: data.phone,
      country: data.country,
    });
    
    if (createResult.isFailure) {
      return createResult;
    }

    const worker = createResult.getValue();

    await this.eventDispatcher.notifyWorkerCreated(worker.id, {
      email: worker.email,
    });

    return Result.ok<Worker>(worker);
  }
}
