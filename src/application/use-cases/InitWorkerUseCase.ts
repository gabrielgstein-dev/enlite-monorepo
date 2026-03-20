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

    const existingByEmail = emailCheckResult.getValue();
    if (existingByEmail !== null) {
      // Reconcile: update auth_uid for existing worker with matching email
      // This handles cases where user recreated their Firebase account (new authUid)
      if (!existingByEmail.authUid || existingByEmail.authUid !== data.authUid) {
        const updateResult = await this.workerRepository.updateAuthUid(
          existingByEmail.id,
          data.authUid
        );
        
        if (updateResult.isFailure) {
          return Result.fail<Worker>(updateResult.error!);
        }
        
        return Result.ok<Worker>(updateResult.getValue());
      }
      
      return Result.ok<Worker>(existingByEmail);
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
