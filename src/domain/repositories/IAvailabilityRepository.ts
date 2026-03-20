import { WorkerAvailability, CreateAvailabilityDTO } from '../entities/WorkerAvailability';
import { Result } from '../shared/Result';

export interface IAvailabilityRepository {
  create(data: CreateAvailabilityDTO): Promise<Result<WorkerAvailability>>;
  findByWorkerId(workerId: string): Promise<Result<WorkerAvailability[]>>;
  deleteByWorkerId(workerId: string): Promise<Result<void>>;
  createBatch(data: CreateAvailabilityDTO[]): Promise<Result<void>>;
}
