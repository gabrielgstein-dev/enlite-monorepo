import { Worker, CreateWorkerDTO, UpdateWorkerStepDTO, SavePersonalInfoDTO } from '../entities/Worker';
import { Result } from '../shared/Result';

export interface IWorkerRepository {
  create(data: CreateWorkerDTO): Promise<Result<Worker>>;
  findById(id: string): Promise<Result<Worker | null>>;
  findByAuthUid(authUid: string): Promise<Result<Worker | null>>;
  findByEmail(email: string): Promise<Result<Worker | null>>;
  updateStep(data: UpdateWorkerStepDTO): Promise<Result<Worker>>;
  updatePersonalInfo(data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & { 
    termsAccepted: boolean; 
    privacyAccepted: boolean; 
  }): Promise<Result<Worker>>;
  updateStatus(workerId: string, status: string): Promise<Result<Worker>>;
  delete(workerId: string): Promise<Result<void>>;
  deleteByAuthUid(authUid: string): Promise<Result<void>>;
}
