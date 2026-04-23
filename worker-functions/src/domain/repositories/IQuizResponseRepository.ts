import { WorkerQuizResponse, CreateQuizResponseDTO } from '../entities/WorkerQuizResponse';
import { Result } from '@shared/utils/Result';

export interface IQuizResponseRepository {
  create(data: CreateQuizResponseDTO): Promise<Result<WorkerQuizResponse>>;
  findByWorkerId(workerId: string): Promise<Result<WorkerQuizResponse[]>>;
}
