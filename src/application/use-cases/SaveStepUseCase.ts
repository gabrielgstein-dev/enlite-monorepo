import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker, UpdateWorkerStepDTO } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export interface SaveStepInput {
  workerId: string;
  step: number;
  data?: any;
}

export class SaveStepUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(input: SaveStepInput): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findById(input.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    if (input.step < worker.currentStep) {
      return Result.fail<Worker>('Cannot go back to previous steps');
    }

    const updateData: UpdateWorkerStepDTO = {
      workerId: input.workerId,
      step: input.step,
    };

    if (input.step === 10) {
      updateData.status = 'review';
    } else if (input.step > worker.currentStep) {
      updateData.status = 'in_progress';
    }

    const updateResult = await this.workerRepository.updateStep(updateData);
    
    if (updateResult.isFailure) {
      return updateResult;
    }

    const updatedWorker = updateResult.getValue();

    await this.eventDispatcher.notifyStepCompleted(
      updatedWorker.id,
      updatedWorker.currentStep,
      input.data
    );

    if (updateData.status) {
      await this.eventDispatcher.notifyStatusChanged(
        updatedWorker.id,
        updateData.status
      );
    }

    return Result.ok<Worker>(updatedWorker);
  }
}
