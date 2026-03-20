import { IWorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { CreateWorkerDocumentsDTO, UpdateWorkerDocumentsDTO, WorkerDocuments } from '../../domain/entities/WorkerDocuments';

export class UploadWorkerDocumentsUseCase {
  constructor(
    private workerDocumentsRepository: IWorkerDocumentsRepository,
    private workerRepository: IWorkerRepository
  ) {}

  async execute(dto: CreateWorkerDocumentsDTO | UpdateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    // Verify worker exists
    const workerResult = await this.workerRepository.findById(dto.workerId);
    if (!workerResult.isSuccess || !workerResult.getValue()) {
      throw new Error('Worker not found');
    }

    // Check if documents already exist
    const existing = await this.workerDocumentsRepository.findByWorkerId(dto.workerId);

    let documents: WorkerDocuments;

    if (existing) {
      // Update existing documents
      documents = await this.workerDocumentsRepository.update(dto as UpdateWorkerDocumentsDTO);
    } else {
      // Create new documents record
      documents = await this.workerDocumentsRepository.create(dto as CreateWorkerDocumentsDTO);
    }

    // Update worker status based on documents status
    if (documents.documentsStatus === 'submitted') {
      await this.workerRepository.updateStatus(dto.workerId, 'review');
    }

    return documents;
  }
}
