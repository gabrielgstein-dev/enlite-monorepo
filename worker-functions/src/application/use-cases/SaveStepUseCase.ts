import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker } from '../../domain/entities/Worker';
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

    // currentStep may be undefined when findById does not select current_step
    // (column removed in migration 096); use 0 as safe fallback.
    const currentStep = worker.currentStep ?? 0;

    if (input.step < currentStep) {
      return Result.fail<Worker>('Cannot go back to previous steps');
    }

    // Recalcula status com base nos campos obrigatórios preenchidos
    const newStatus = await this.workerRepository.recalculateStatus(input.workerId);
    if (newStatus) {
      await this.eventDispatcher.notifyStatusChanged(worker.id, newStatus);
    }

    await this.eventDispatcher.notifyStepCompleted(worker.id, input.step, input.data);

    return Result.ok<Worker>(worker);
  }
}
