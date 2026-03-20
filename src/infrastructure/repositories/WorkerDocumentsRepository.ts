import { Pool } from 'pg';
import { 
  WorkerDocuments, 
  CreateWorkerDocumentsDTO, 
  UpdateWorkerDocumentsDTO,
  ReviewWorkerDocumentsDTO,
  DocumentsStatus 
} from '../../domain/entities/WorkerDocuments';

export interface IWorkerDocumentsRepository {
  create(dto: CreateWorkerDocumentsDTO): Promise<WorkerDocuments>;
  findByWorkerId(workerId: string): Promise<WorkerDocuments | null>;
  update(dto: UpdateWorkerDocumentsDTO): Promise<WorkerDocuments>;
  review(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments>;
  delete(workerId: string): Promise<void>;
  clearDocumentField(workerId: string, columnName: string): Promise<void>;
}

export class WorkerDocumentsRepository implements IWorkerDocumentsRepository {
  constructor(private pool: Pool) {}

  async create(dto: CreateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    const query = `
      INSERT INTO worker_documents (
        worker_id,
        resume_cv_url,
        identity_document_url,
        criminal_record_url,
        professional_registration_url,
        liability_insurance_url,
        additional_certificates_urls,
        documents_status,
        submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;

    const values = [
      dto.workerId,
      dto.resumeCvUrl || null,
      dto.identityDocumentUrl || null,
      dto.criminalRecordUrl || null,
      dto.professionalRegistrationUrl || null,
      dto.liabilityInsuranceUrl || null,
      dto.additionalCertificatesUrls || [],
      this.determineStatus(dto),
    ];

    const result = await this.pool.query(query, values);
    return this.mapToEntity(result.rows[0]);
  }

  async findByWorkerId(workerId: string): Promise<WorkerDocuments | null> {
    const query = 'SELECT * FROM worker_documents WHERE worker_id = $1';
    const result = await this.pool.query(query, [workerId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(result.rows[0]);
  }

  async update(dto: UpdateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    const existing = await this.findByWorkerId(dto.workerId);
    if (!existing) {
      throw new Error('Worker documents not found');
    }

    const query = `
      UPDATE worker_documents
      SET
        resume_cv_url = COALESCE($2, resume_cv_url),
        identity_document_url = COALESCE($3, identity_document_url),
        criminal_record_url = COALESCE($4, criminal_record_url),
        professional_registration_url = COALESCE($5, professional_registration_url),
        liability_insurance_url = COALESCE($6, liability_insurance_url),
        additional_certificates_urls = COALESCE($7, additional_certificates_urls),
        documents_status = $8,
        resubmitted_at = CASE WHEN $9 THEN NOW() ELSE resubmitted_at END,
        updated_at = NOW()
      WHERE worker_id = $1
      RETURNING *
    `;

    const newStatus = dto.documentsStatus || this.determineStatusFromUpdate(dto, existing);
    const isResubmission = existing.documentsStatus === 'rejected' && newStatus === 'submitted';

    const values = [
      dto.workerId,
      dto.resumeCvUrl,
      dto.identityDocumentUrl,
      dto.criminalRecordUrl,
      dto.professionalRegistrationUrl,
      dto.liabilityInsuranceUrl,
      dto.additionalCertificatesUrls,
      newStatus,
      isResubmission,
    ];

    const result = await this.pool.query(query, values);
    return this.mapToEntity(result.rows[0]);
  }

  async review(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments> {
    const query = `
      UPDATE worker_documents
      SET
        documents_status = $2,
        review_notes = $3,
        reviewed_by = $4,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE worker_id = $1
      RETURNING *
    `;

    const values = [
      dto.workerId,
      dto.documentsStatus,
      dto.reviewNotes || null,
      dto.reviewedBy,
    ];

    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Worker documents not found');
    }

    return this.mapToEntity(result.rows[0]);
  }

  async delete(workerId: string): Promise<void> {
    await this.pool.query('DELETE FROM worker_documents WHERE worker_id = $1', [workerId]);
  }

  async clearDocumentField(workerId: string, columnName: string): Promise<void> {
    const allowed = [
      'resume_cv_url', 'identity_document_url', 'criminal_record_url',
      'professional_registration_url', 'liability_insurance_url',
    ];
    if (!allowed.includes(columnName)) throw new Error(`Invalid column: ${columnName}`);
    await this.pool.query(
      `UPDATE worker_documents SET ${columnName} = NULL, updated_at = NOW() WHERE worker_id = $1`,
      [workerId],
    );
  }

  private mapToEntity(row: any): WorkerDocuments {
    return {
      id: row.id,
      workerId: row.worker_id,
      resumeCvUrl: row.resume_cv_url,
      identityDocumentUrl: row.identity_document_url,
      criminalRecordUrl: row.criminal_record_url,
      professionalRegistrationUrl: row.professional_registration_url,
      liabilityInsuranceUrl: row.liability_insurance_url,
      additionalCertificatesUrls: row.additional_certificates_urls || [],
      documentsStatus: row.documents_status as DocumentsStatus,
      reviewNotes: row.review_notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      resubmittedAt: row.resubmitted_at ? new Date(row.resubmitted_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private determineStatus(dto: CreateWorkerDocumentsDTO): DocumentsStatus {
    const requiredDocs = [
      dto.resumeCvUrl,
      dto.identityDocumentUrl,
      dto.criminalRecordUrl,
      dto.professionalRegistrationUrl,
      dto.liabilityInsuranceUrl,
    ];

    const filledDocs = requiredDocs.filter(doc => doc).length;

    if (filledDocs === 0) return 'pending';
    if (filledDocs < 5) return 'incomplete';
    return 'submitted';
  }

  private determineStatusFromUpdate(dto: UpdateWorkerDocumentsDTO, existing: WorkerDocuments): DocumentsStatus {
    const requiredDocs = [
      dto.resumeCvUrl || existing.resumeCvUrl,
      dto.identityDocumentUrl || existing.identityDocumentUrl,
      dto.criminalRecordUrl || existing.criminalRecordUrl,
      dto.professionalRegistrationUrl || existing.professionalRegistrationUrl,
      dto.liabilityInsuranceUrl || existing.liabilityInsuranceUrl,
    ];

    const filledDocs = requiredDocs.filter(doc => doc).length;

    if (filledDocs === 0) return 'pending';
    if (filledDocs < 5) return 'incomplete';
    return 'submitted';
  }
}
