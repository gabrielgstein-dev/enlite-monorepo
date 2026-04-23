import { Pool } from 'pg';
import {
  WorkerAdditionalDocument,
  CreateAdditionalDocumentDTO,
} from '../domain/WorkerDocuments';

export interface IWorkerAdditionalDocumentsRepository {
  findByWorkerId(workerId: string): Promise<WorkerAdditionalDocument[]>;
  create(dto: CreateAdditionalDocumentDTO): Promise<WorkerAdditionalDocument>;
  deleteById(id: string, workerId: string): Promise<void>;
}

export class WorkerAdditionalDocumentsRepository implements IWorkerAdditionalDocumentsRepository {
  constructor(private pool: Pool) {}

  async findByWorkerId(workerId: string): Promise<WorkerAdditionalDocument[]> {
    const result = await this.pool.query(
      'SELECT * FROM worker_additional_documents WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId],
    );
    return result.rows.map(this.mapToEntity);
  }

  async create(dto: CreateAdditionalDocumentDTO): Promise<WorkerAdditionalDocument> {
    const result = await this.pool.query(
      `INSERT INTO worker_additional_documents (worker_id, label, file_path)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.workerId, dto.label, dto.filePath],
    );
    return this.mapToEntity(result.rows[0]);
  }

  async deleteById(id: string, workerId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM worker_additional_documents WHERE id = $1 AND worker_id = $2',
      [id, workerId],
    );
    if (result.rowCount === 0) {
      throw new Error('Document not found or does not belong to this worker');
    }
  }

  private mapToEntity(row: any): WorkerAdditionalDocument {
    return {
      id: row.id,
      workerId: row.worker_id,
      label: row.label,
      filePath: row.file_path,
      uploadedAt: new Date(row.uploaded_at),
      createdAt: new Date(row.created_at),
    };
  }
}
