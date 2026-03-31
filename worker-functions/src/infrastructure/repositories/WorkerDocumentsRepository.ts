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
    const status = this.determineStatus(dto);
    console.log('[WorkerDocumentsRepo.create] workerId:', dto.workerId, '| determinedStatus:', status,
      '| docs:', { resume: !!dto.resumeCvUrl, identity: !!dto.identityDocumentUrl, criminal: !!dto.criminalRecordUrl, professional: !!dto.professionalRegistrationUrl, insurance: !!dto.liabilityInsuranceUrl });

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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'submitted' THEN NOW() ELSE NULL END)
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
      status,
    ];

    const result = await this.pool.query(query, values);
    console.log('[WorkerDocumentsRepo.create] SUCCESS | id:', result.rows[0]?.id, '| rowCount:', result.rowCount);
    return this.mapToEntity(result.rows[0]);
  }

  async findByWorkerId(workerId: string): Promise<WorkerDocuments | null> {
    console.log('[WorkerDocumentsRepo.findByWorkerId] workerId:', workerId);
    const query = 'SELECT * FROM worker_documents WHERE worker_id = $1';
    const result = await this.pool.query(query, [workerId]);

    if (result.rows.length === 0) {
      console.log('[WorkerDocumentsRepo.findByWorkerId] no documents found for worker:', workerId);
      return null;
    }

    console.log('[WorkerDocumentsRepo.findByWorkerId] found | status:', result.rows[0].documents_status,
      '| docs:', { resume: !!result.rows[0].resume_cv_url, identity: !!result.rows[0].identity_document_url, criminal: !!result.rows[0].criminal_record_url, professional: !!result.rows[0].professional_registration_url, insurance: !!result.rows[0].liability_insurance_url });
    return this.mapToEntity(result.rows[0]);
  }

  async update(dto: UpdateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.update] workerId:', dto.workerId, '| incoming fields:', Object.keys(dto).filter(k => k !== 'workerId' && (dto as unknown as Record<string, unknown>)[k]).join(', '));
    const existing = await this.findByWorkerId(dto.workerId);
    if (!existing) {
      console.error('[WorkerDocumentsRepo.update] FAIL: no existing documents for worker:', dto.workerId);
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
    console.log('[WorkerDocumentsRepo.update] computed | newStatus:', newStatus, '| isResubmission:', isResubmission,
      '| mergedDocs:', {
        resume: !!(dto.resumeCvUrl || existing.resumeCvUrl),
        identity: !!(dto.identityDocumentUrl || existing.identityDocumentUrl),
        criminal: !!(dto.criminalRecordUrl || existing.criminalRecordUrl),
        professional: !!(dto.professionalRegistrationUrl || existing.professionalRegistrationUrl),
        insurance: !!(dto.liabilityInsuranceUrl || existing.liabilityInsuranceUrl),
      });

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
    console.log('[WorkerDocumentsRepo.update] SUCCESS | rowCount:', result.rowCount, '| finalStatus:', result.rows[0]?.documents_status);
    return this.mapToEntity(result.rows[0]);
  }

  async review(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.review] workerId:', dto.workerId, '| newStatus:', dto.documentsStatus, '| reviewedBy:', dto.reviewedBy);

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
      console.error('[WorkerDocumentsRepo.review] FAIL: no documents found for worker:', dto.workerId);
      throw new Error('Worker documents not found');
    }

    console.log('[WorkerDocumentsRepo.review] SUCCESS | finalStatus:', result.rows[0].documents_status);
    return this.mapToEntity(result.rows[0]);
  }

  async delete(workerId: string): Promise<void> {
    console.log('[WorkerDocumentsRepo.delete] workerId:', workerId);
    await this.pool.query('DELETE FROM worker_documents WHERE worker_id = $1', [workerId]);
    console.log('[WorkerDocumentsRepo.delete] SUCCESS');
  }

  async clearDocumentField(workerId: string, columnName: string): Promise<void> {
    console.log('[WorkerDocumentsRepo.clearDocumentField] workerId:', workerId, '| column:', columnName);
    const allowed = [
      'resume_cv_url', 'identity_document_url', 'criminal_record_url',
      'professional_registration_url', 'liability_insurance_url',
    ];
    if (!allowed.includes(columnName)) throw new Error(`Invalid column: ${columnName}`);
    await this.pool.query(
      `UPDATE worker_documents SET ${columnName} = NULL, updated_at = NOW() WHERE worker_id = $1`,
      [workerId],
    );
    console.log('[WorkerDocumentsRepo.clearDocumentField] SUCCESS');
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
