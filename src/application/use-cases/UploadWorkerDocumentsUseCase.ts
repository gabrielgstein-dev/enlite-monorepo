import { IWorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { CreateWorkerDocumentsDTO, UpdateWorkerDocumentsDTO, WorkerDocuments } from '../../domain/entities/WorkerDocuments';

export class UploadWorkerDocumentsUseCase {
  constructor(
    private workerDocumentsRepository: IWorkerDocumentsRepository,
    private workerRepository: IWorkerRepository
  ) {}

  async execute(dto: CreateWorkerDocumentsDTO | UpdateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[UploadWorkerDocumentsUseCase] START | workerId:', dto.workerId, '| fields:', Object.keys(dto).filter(k => k !== 'workerId').join(', '));

    // Verify worker exists
    const workerResult = await this.workerRepository.findById(dto.workerId);
    if (!workerResult.isSuccess || !workerResult.getValue()) {
      console.error('[UploadWorkerDocumentsUseCase] FAIL: Worker not found for id:', dto.workerId);
      throw new Error('Worker not found');
    }
    console.log('[UploadWorkerDocumentsUseCase] worker verified OK');

    // Check if documents already exist
    const existing = await this.workerDocumentsRepository.findByWorkerId(dto.workerId);
    console.log('[UploadWorkerDocumentsUseCase] existing documents:', existing ? 'YES (status: ' + existing.documentsStatus + ')' : 'NO (will create)');

    let documents: WorkerDocuments;

    if (existing) {
      // Update existing documents
      console.log('[UploadWorkerDocumentsUseCase] updating existing documents...');
      documents = await this.workerDocumentsRepository.update(dto as UpdateWorkerDocumentsDTO);
    } else {
      // Create new documents record
      console.log('[UploadWorkerDocumentsUseCase] creating new documents record...');
      documents = await this.workerDocumentsRepository.create(dto as CreateWorkerDocumentsDTO);
    }

    console.log('[UploadWorkerDocumentsUseCase] documents saved | newStatus:', documents.documentsStatus,
      '| docs filled:', [documents.resumeCvUrl, documents.identityDocumentUrl, documents.criminalRecordUrl, documents.professionalRegistrationUrl, documents.liabilityInsuranceUrl].filter(Boolean).length, '/5');

    // Update worker status based on documents status
    if (documents.documentsStatus === 'submitted') {
      console.log('[UploadWorkerDocumentsUseCase] all 5 docs present → updating worker status to "review"');
      // await this.workerRepository.updateStatus(dto.workerId, 'review'); // status column removed
    }

    console.log('[UploadWorkerDocumentsUseCase] DONE | workerId:', dto.workerId, '| finalStatus:', documents.documentsStatus);
    return documents;
  }
}
