import { Request, Response } from 'express';
import { GCSStorageService, DocumentType } from '../../infrastructure/services/GCSStorageService';
import { WorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';
import { WorkerRepository } from '../../infrastructure/repositories/WorkerRepository';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { GetWorkerProgressUseCase } from '../../application/use-cases/GetWorkerProgressUseCase';
import { UploadWorkerDocumentsUseCase } from '../../application/use-cases/UploadWorkerDocumentsUseCase';

const VALID_DOC_TYPES: DocumentType[] = [
  'resume_cv', 'identity_document', 'criminal_record',
  'professional_registration', 'liability_insurance',
];

const DOC_JS_FIELD: Record<DocumentType, string> = {
  resume_cv: 'resumeCvUrl', identity_document: 'identityDocumentUrl',
  criminal_record: 'criminalRecordUrl', professional_registration: 'professionalRegistrationUrl',
  liability_insurance: 'liabilityInsuranceUrl',
};

const DOC_SQL_COL: Record<DocumentType, string> = {
  resume_cv: 'resume_cv_url', identity_document: 'identity_document_url',
  criminal_record: 'criminal_record_url', professional_registration: 'professional_registration_url',
  liability_insurance: 'liability_insurance_url',
};

export class WorkerDocumentsMeController {
  private readonly gcs = new GCSStorageService();
  private readonly documentsRepo: WorkerDocumentsRepository;
  private readonly getProgressUseCase: GetWorkerProgressUseCase;
  private readonly uploadUseCase: UploadWorkerDocumentsUseCase;

  constructor() {
    const pool = DatabaseConnection.getInstance().getPool();
    const workerRepo = new WorkerRepository();
    this.documentsRepo = new WorkerDocumentsRepository(pool);
    this.getProgressUseCase = new GetWorkerProgressUseCase(workerRepo);
    this.uploadUseCase = new UploadWorkerDocumentsUseCase(this.documentsRepo, workerRepo);
  }

  private getAuthUid(req: Request): string | null {
    return (req as Request & { user?: { uid: string } }).user?.uid
      ?? (req.headers['x-auth-uid'] as string | undefined)
      ?? null;
  }

  private async resolveWorker(authUid: string): Promise<{ id: string } | null> {
    const result = await this.getProgressUseCase.execute(authUid);
    return result.isFailure ? null : result.getValue() as { id: string };
  }

  async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const docs = await this.documentsRepo.findByWorkerId(worker.id);
      res.status(200).json({ success: true, data: docs });
    } catch (err) {
      console.error('[getDocuments]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getUploadSignedUrl(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { docType } = req.body as { docType: unknown };
      if (!docType || !VALID_DOC_TYPES.includes(docType as DocumentType)) {
        res.status(400).json({ success: false, error: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` }); return;
      }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const result = await this.gcs.generateUploadSignedUrl(worker.id, docType as DocumentType);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      console.error('[getUploadSignedUrl]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async saveDocumentPath(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { docType, filePath } = req.body as { docType: unknown; filePath: unknown };
      if (!docType || !VALID_DOC_TYPES.includes(docType as DocumentType) || !filePath) {
        res.status(400).json({ success: false, error: 'docType and filePath are required' }); return;
      }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const docs = await this.uploadUseCase.execute({
        workerId: worker.id,
        [DOC_JS_FIELD[docType as DocumentType]]: filePath as string,
      });
      res.status(200).json({ success: true, data: docs });
    } catch (err) {
      console.error('[saveDocumentPath]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getViewSignedUrl(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { filePath } = req.body as { filePath: unknown };
      if (!filePath || typeof filePath !== 'string') {
        res.status(400).json({ success: false, error: 'filePath is required' }); return;
      }
      const signedUrl = await this.gcs.generateViewSignedUrl(filePath);
      res.status(200).json({ success: true, data: { signedUrl } });
    } catch (err) {
      console.error('[getViewSignedUrl]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { type: docType } = req.params;
      if (!VALID_DOC_TYPES.includes(docType as DocumentType)) {
        res.status(400).json({ success: false, error: 'Invalid document type' }); return;
      }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const existing = await this.documentsRepo.findByWorkerId(worker.id);
      const filePath = (existing as Record<string, string | undefined> | null)?.[DOC_JS_FIELD[docType as DocumentType]];
      if (filePath) { await this.gcs.deleteFile(filePath); }
      if (existing) {
        await this.documentsRepo.clearDocumentField(worker.id, DOC_SQL_COL[docType as DocumentType]);
      }
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[deleteDocument]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
