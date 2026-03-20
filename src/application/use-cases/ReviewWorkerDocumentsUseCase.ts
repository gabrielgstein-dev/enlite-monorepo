import { IWorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { ReviewWorkerDocumentsDTO, WorkerDocuments } from '../../domain/entities/WorkerDocuments';

export class ReviewWorkerDocumentsUseCase {
  constructor(
    private workerDocumentsRepository: IWorkerDocumentsRepository,
    private workerRepository: IWorkerRepository
  ) {}

  async execute(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments> {
    // Verify worker exists
    const workerResult = await this.workerRepository.findById(dto.workerId);
    if (!workerResult.isSuccess || !workerResult.getValue()) {
      throw new Error('Worker not found');
    }

    // Verify documents exist
    const existing = await this.workerDocumentsRepository.findByWorkerId(dto.workerId);
    if (!existing) {
      throw new Error('Worker documents not found');
    }

    // Only allow review if documents are submitted or under review
    if (!['submitted', 'under_review'].includes(existing.documentsStatus)) {
      throw new Error(`Cannot review documents with status: ${existing.documentsStatus}`);
    }

    // Review documents
    const documents = await this.workerDocumentsRepository.review(dto);

    // Update worker status based on review result
    if (dto.documentsStatus === 'approved') {
      await this.workerRepository.updateStatus(dto.workerId, 'approved');
    } else if (dto.documentsStatus === 'rejected') {
      await this.workerRepository.updateStatus(dto.workerId, 'rejected');
    }

    return documents;
  }
}
