import { IWorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { ReviewWorkerDocumentsDTO, WorkerDocuments } from '../../domain/entities/WorkerDocuments';

export class ReviewWorkerDocumentsUseCase {
  constructor(
    private workerDocumentsRepository: IWorkerDocumentsRepository,
    private workerRepository: IWorkerRepository
  ) {}

  async execute(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[ReviewWorkerDocumentsUseCase] START | workerId:', dto.workerId, '| decision:', dto.documentsStatus, '| reviewedBy:', dto.reviewedBy);

    // Verify worker exists
    const workerResult = await this.workerRepository.findById(dto.workerId);
    if (!workerResult.isSuccess || !workerResult.getValue()) {
      console.error('[ReviewWorkerDocumentsUseCase] FAIL: Worker not found for id:', dto.workerId);
      throw new Error('Worker not found');
    }

    // Verify documents exist
    const existing = await this.workerDocumentsRepository.findByWorkerId(dto.workerId);
    if (!existing) {
      console.error('[ReviewWorkerDocumentsUseCase] FAIL: no documents found for worker:', dto.workerId);
      throw new Error('Worker documents not found');
    }

    console.log('[ReviewWorkerDocumentsUseCase] current documents_status:', existing.documentsStatus);

    // Only allow review if documents are submitted or under review
    if (!['submitted', 'under_review'].includes(existing.documentsStatus)) {
      console.error('[ReviewWorkerDocumentsUseCase] FAIL: cannot review with status:', existing.documentsStatus);
      throw new Error(`Cannot review documents with status: ${existing.documentsStatus}`);
    }

    // Review documents
    const documents = await this.workerDocumentsRepository.review(dto);

    // Update worker status based on review result
    if (dto.documentsStatus === 'approved') {
      console.log('[ReviewWorkerDocumentsUseCase] approving → updating worker status to "approved"');
      // await this.workerRepository.updateStatus(dto.workerId, 'approved'); // status column removed
    } else if (dto.documentsStatus === 'rejected') {
      console.log('[ReviewWorkerDocumentsUseCase] rejecting → updating worker status to "rejected"');
      // await this.workerRepository.updateStatus(dto.workerId, 'rejected'); // status column removed
    }

    console.log('[ReviewWorkerDocumentsUseCase] DONE | workerId:', dto.workerId, '| finalStatus:', documents.documentsStatus);
    return documents;
  }
}
