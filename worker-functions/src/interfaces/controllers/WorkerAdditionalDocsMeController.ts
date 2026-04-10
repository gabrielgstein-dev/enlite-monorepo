import { Request, Response } from 'express';
import { GCSStorageService } from '../../infrastructure/services/GCSStorageService';
import { WorkerAdditionalDocumentsRepository } from '../../infrastructure/repositories/WorkerAdditionalDocumentsRepository';
import { WorkerRepository } from '../../infrastructure/repositories/WorkerRepository';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { GetWorkerProgressUseCase } from '../../application/use-cases/GetWorkerProgressUseCase';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';

export class WorkerAdditionalDocsMeController {
  private readonly gcs = new GCSStorageService();
  private readonly repo: WorkerAdditionalDocumentsRepository;
  private readonly workerRepo: IWorkerRepository;
  private readonly getProgressUseCase: GetWorkerProgressUseCase;

  constructor() {
    const pool = DatabaseConnection.getInstance().getPool();
    this.workerRepo = new WorkerRepository();
    this.repo = new WorkerAdditionalDocumentsRepository(pool);
    this.getProgressUseCase = new GetWorkerProgressUseCase(this.workerRepo);
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

  async list(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const docs = await this.repo.findByWorkerId(worker.id);
      res.status(200).json({ success: true, data: docs });
    } catch (err) {
      console.error('[AdditionalDocsMeCtrl.list] ERROR:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getUploadUrl(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { contentType } = req.body as { contentType?: string };
      const VALID = ['application/pdf', 'image/jpeg', 'image/png'];
      const resolved = typeof contentType === 'string' && VALID.includes(contentType) ? contentType : 'application/pdf';
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const result = await this.gcs.generateAdditionalUploadSignedUrl(worker.id, resolved);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      console.error('[AdditionalDocsMeCtrl.getUploadUrl] ERROR:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async save(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { label, filePath } = req.body as { label?: string; filePath?: string };
      if (!label || !label.trim() || label.length > 255) {
        res.status(400).json({ success: false, error: 'label is required (max 255 chars)' }); return;
      }
      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' }); return;
      }
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      const doc = await this.repo.create({ workerId: worker.id, label: label.trim(), filePath });
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      console.error('[AdditionalDocsMeCtrl.save] ERROR:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async remove(req: Request, res: Response): Promise<void> {
    try {
      const authUid = this.getAuthUid(req);
      if (!authUid) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      const { id } = req.params;
      const worker = await this.resolveWorker(authUid);
      if (!worker) { res.status(404).json({ success: false, error: 'Worker not found' }); return; }
      // Fetch doc to delete from GCS
      const docs = await this.repo.findByWorkerId(worker.id);
      const target = docs.find(d => d.id === id);
      if (target) { await this.gcs.deleteFile(target.filePath); }
      await this.repo.deleteById(id, worker.id);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[AdditionalDocsMeCtrl.remove] ERROR:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
