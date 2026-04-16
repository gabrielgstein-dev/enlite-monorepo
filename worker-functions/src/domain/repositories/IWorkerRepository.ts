import { Worker, WorkerStatus, CreateWorkerDTO, UpdateWorkerStepDTO, SavePersonalInfoDTO } from '../entities/Worker';
import { Result } from '../shared/Result';

export interface IWorkerRepository {
  create(data: CreateWorkerDTO): Promise<Result<Worker>>;
  findById(id: string): Promise<Result<Worker | null>>;
  findByAuthUid(authUid: string): Promise<Result<Worker | null>>;
  findByEmail(email: string): Promise<Result<Worker | null>>;
  findByPhone(phone: string): Promise<Result<Worker | null>>;
  findByPhoneCandidates(candidates: string[]): Promise<Result<Worker | null>>;
  updatePersonalInfo(data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & {
    termsAccepted: boolean;
    privacyAccepted: boolean;
  }): Promise<Result<Worker>>;
  updateAuthUid(workerId: string, authUid: string, phone?: string): Promise<Result<Worker>>;
  updateImportedWorkerData(workerId: string, data: { authUid: string; email: string }): Promise<Result<Worker>>;
  updateStatus(workerId: string, status: WorkerStatus): Promise<void>;
  /** Retorna o novo status se houve mudança, ou null se inalterado / DISABLED. */
  recalculateStatus(workerId: string): Promise<WorkerStatus | null>;
  delete(workerId: string): Promise<Result<void>>;
  deleteByAuthUid(authUid: string): Promise<Result<void>>;
}
