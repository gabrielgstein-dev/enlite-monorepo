import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IQuizResponseRepository } from '../../domain/repositories/IQuizResponseRepository';
import { SaveQuizResponseDTO } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class SaveQuizResponsesUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private quizResponseRepository: IQuizResponseRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(data: SaveQuizResponseDTO): Promise<Result<void>> {
    const workerResult = await this.workerRepository.findById(data.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<void>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<void>('Worker not found');
    }

    for (const response of data.responses) {
      const saveResult = await this.quizResponseRepository.create({
        workerId: data.workerId,
        sectionId: response.sectionId,
        questionId: response.questionId,
        answerId: response.answerId,
      });

      if (saveResult.isFailure) {
        return Result.fail<void>(saveResult.error!);
      }
    }

    const updateResult = await this.workerRepository.updateStep({
      workerId: data.workerId,
      step: 2,
      status: 'in_progress',
    });

    if (updateResult.isFailure) {
      return Result.fail<void>(updateResult.error!);
    }

    await this.eventDispatcher.notifyStepCompleted(data.workerId, 1, {
      responsesCount: data.responses.length,
    });

    return Result.ok<void>();
  }
}
