import { Pool } from 'pg';
import {
  WorkerDocuments,
  CreateWorkerDocumentsDTO,
  UpdateWorkerDocumentsDTO,
  ReviewWorkerDocumentsDTO,
  DocumentsStatus,
  DocumentValidations
} from '../domain/WorkerDocuments';

export interface IWorkerDocumentsRepository {
  create(dto: CreateWorkerDocumentsDTO): Promise<WorkerDocuments>;
  findByWorkerId(workerId: string): Promise<WorkerDocuments | null>;
  update(dto: UpdateWorkerDocumentsDTO): Promise<WorkerDocuments>;
  review(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments>;
  delete(workerId: string): Promise<void>;
  clearDocumentField(workerId: string, columnName: string, docTypeSlug?: string): Promise<void>;
  validateDocument(workerId: string, docType: string, adminEmail: string): Promise<WorkerDocuments>;
  clearDocumentValidation(workerId: string, docType: string): Promise<WorkerDocuments>;
}

/** Base required docs for all workers (6). */
const BASE_REQUIRED_FIELDS = [
  'resumeCvUrl', 'identityDocumentUrl', 'identityDocumentBackUrl',
  'criminalRecordUrl', 'professionalRegistrationUrl', 'liabilityInsuranceUrl',
] as const;

/** Extra required docs when profession = 'AT' (2). */
const AT_EXTRA_FIELDS = ['monotributoCertificateUrl', 'atCertificateUrl'] as const;

export class WorkerDocumentsRepository implements IWorkerDocumentsRepository {
  constructor(private pool: Pool) {}

  async create(dto: CreateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    const profession = await this.getWorkerProfession(dto.workerId);
    const status = this.computeStatus(dto as unknown as Record<string, unknown>, profession);
    console.log('[WorkerDocumentsRepo.create] workerId:', dto.workerId, '| status:', status, '| profession:', profession);

    const query = `
      INSERT INTO worker_documents (
        worker_id, resume_cv_url, identity_document_url, identity_document_back_url,
        criminal_record_url, professional_registration_url, liability_insurance_url,
        monotributo_certificate_url, at_certificate_url,
        additional_certificates_urls, documents_status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      dto.workerId,
      dto.resumeCvUrl || null,
      dto.identityDocumentUrl || null,
      dto.identityDocumentBackUrl || null,
      dto.criminalRecordUrl || null,
      dto.professionalRegistrationUrl || null,
      dto.liabilityInsuranceUrl || null,
      dto.monotributoCertificateUrl || null,
      dto.atCertificateUrl || null,
      dto.additionalCertificatesUrls || [],
      status,
      status === 'submitted' ? new Date() : null,
    ];

    const result = await this.pool.query(query, values);
    console.log('[WorkerDocumentsRepo.create] SUCCESS | id:', result.rows[0]?.id);
    return this.mapToEntity(result.rows[0]);
  }

  async findByWorkerId(workerId: string): Promise<WorkerDocuments | null> {
    console.log('[WorkerDocumentsRepo.findByWorkerId] workerId:', workerId);
    const query = 'SELECT * FROM worker_documents WHERE worker_id = $1';
    const result = await this.pool.query(query, [workerId]);

    if (result.rows.length === 0) {
      console.log('[WorkerDocumentsRepo.findByWorkerId] not found');
      return null;
    }

    console.log('[WorkerDocumentsRepo.findByWorkerId] found | status:', result.rows[0].documents_status);
    return this.mapToEntity(result.rows[0]);
  }

  async update(dto: UpdateWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.update] workerId:', dto.workerId);
    const existing = await this.findByWorkerId(dto.workerId);
    if (!existing) {
      throw new Error('Worker documents not found');
    }

    const profession = await this.getWorkerProfession(dto.workerId);
    const merged = this.mergeForStatus(dto, existing);
    const newStatus = dto.documentsStatus || this.computeStatus(merged, profession);
    const isResubmission = existing.documentsStatus === 'rejected' && newStatus === 'submitted';

    // Determine which doc type slugs are being re-uploaded so we can clear their validations
    const docFieldToSlug: Array<{ field: keyof UpdateWorkerDocumentsDTO; slug: string }> = [
      { field: 'resumeCvUrl', slug: 'resume_cv' },
      { field: 'identityDocumentUrl', slug: 'identity_document' },
      { field: 'identityDocumentBackUrl', slug: 'identity_document_back' },
      { field: 'criminalRecordUrl', slug: 'criminal_record' },
      { field: 'professionalRegistrationUrl', slug: 'professional_registration' },
      { field: 'liabilityInsuranceUrl', slug: 'liability_insurance' },
      { field: 'monotributoCertificateUrl', slug: 'monotributo_certificate' },
      { field: 'atCertificateUrl', slug: 'at_certificate' },
    ];
    const reuploaded = docFieldToSlug
      .filter(({ field }) => dto[field] != null)
      .map(({ slug }) => slug);

    console.log('[WorkerDocumentsRepo.update] newStatus:', newStatus, '| profession:', profession,
      '| isResubmission:', isResubmission, '| clearingValidations:', reuploaded);

    // Build a JSONB expression that removes all re-uploaded doc type keys from document_validations.
    // Uses the jsonb - text[] operator (PostgreSQL 10+) which removes multiple top-level keys at once.
    // NOTE: jsonb #- text[] is NOT used here because it interprets the array as a nested path,
    // not as a list of independent top-level keys to remove.
    const validationExpr = reuploaded.length > 0
      ? `document_validations - ARRAY[${reuploaded.map((s) => `'${s}'`).join(', ')}]::text[]`
      : 'document_validations';

    const query = `
      UPDATE worker_documents
      SET
        resume_cv_url = COALESCE($2, resume_cv_url),
        identity_document_url = COALESCE($3, identity_document_url),
        identity_document_back_url = COALESCE($4, identity_document_back_url),
        criminal_record_url = COALESCE($5, criminal_record_url),
        professional_registration_url = COALESCE($6, professional_registration_url),
        liability_insurance_url = COALESCE($7, liability_insurance_url),
        monotributo_certificate_url = COALESCE($8, monotributo_certificate_url),
        at_certificate_url = COALESCE($9, at_certificate_url),
        additional_certificates_urls = COALESCE($10, additional_certificates_urls),
        documents_status = $11,
        document_validations = ${validationExpr},
        resubmitted_at = CASE WHEN $12 THEN NOW() ELSE resubmitted_at END,
        updated_at = NOW()
      WHERE worker_id = $1
      RETURNING *
    `;

    const values = [
      dto.workerId,
      dto.resumeCvUrl,
      dto.identityDocumentUrl,
      dto.identityDocumentBackUrl,
      dto.criminalRecordUrl,
      dto.professionalRegistrationUrl,
      dto.liabilityInsuranceUrl,
      dto.monotributoCertificateUrl,
      dto.atCertificateUrl,
      dto.additionalCertificatesUrls,
      newStatus,
      isResubmission,
    ];

    const result = await this.pool.query(query, values);
    console.log('[WorkerDocumentsRepo.update] SUCCESS | finalStatus:', result.rows[0]?.documents_status);
    return this.mapToEntity(result.rows[0]);
  }

  async review(dto: ReviewWorkerDocumentsDTO): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.review] workerId:', dto.workerId, '| newStatus:', dto.documentsStatus);

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

    const values = [dto.workerId, dto.documentsStatus, dto.reviewNotes || null, dto.reviewedBy];
    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Worker documents not found');
    }

    console.log('[WorkerDocumentsRepo.review] SUCCESS | finalStatus:', result.rows[0].documents_status);
    return this.mapToEntity(result.rows[0]);
  }

  async delete(workerId: string): Promise<void> {
    console.log('[WorkerDocumentsRepo.delete] workerId:', workerId);
    await this.pool.query('DELETE FROM worker_documents WHERE worker_id = $1', [workerId]);
  }

  async clearDocumentField(workerId: string, columnName: string, docTypeSlug?: string): Promise<void> {
    console.log('[WorkerDocumentsRepo.clearDocumentField] workerId:', workerId, '| column:', columnName, '| docTypeSlug:', docTypeSlug);
    const allowed = [
      'resume_cv_url', 'identity_document_url', 'identity_document_back_url',
      'criminal_record_url', 'professional_registration_url', 'liability_insurance_url',
      'monotributo_certificate_url', 'at_certificate_url',
    ];
    if (!allowed.includes(columnName)) throw new Error(`Invalid column: ${columnName}`);

    if (docTypeSlug) {
      await this.pool.query(
        `UPDATE worker_documents
         SET ${columnName} = NULL,
             document_validations = document_validations - $2,
             updated_at = NOW()
         WHERE worker_id = $1`,
        [workerId, docTypeSlug],
      );
    } else {
      await this.pool.query(
        `UPDATE worker_documents SET ${columnName} = NULL, updated_at = NOW() WHERE worker_id = $1`,
        [workerId],
      );
    }
  }

  async validateDocument(workerId: string, docType: string, adminEmail: string): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.validateDocument] workerId:', workerId, '| docType:', docType, '| adminEmail:', adminEmail);
    const query = `
      UPDATE worker_documents
      SET document_validations = document_validations || jsonb_build_object(
            $2::text, jsonb_build_object('validated_by', $3::text, 'validated_at', NOW()::text)
          ),
          updated_at = NOW()
      WHERE worker_id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [workerId, docType, adminEmail]);
    if (result.rows.length === 0) throw new Error('Worker documents not found');
    console.log('[WorkerDocumentsRepo.validateDocument] SUCCESS | docType:', docType);
    return this.mapToEntity(result.rows[0]);
  }

  async clearDocumentValidation(workerId: string, docType: string): Promise<WorkerDocuments> {
    console.log('[WorkerDocumentsRepo.clearDocumentValidation] workerId:', workerId, '| docType:', docType);
    const result = await this.pool.query(
      `UPDATE worker_documents
       SET document_validations = document_validations - $2,
           updated_at = NOW()
       WHERE worker_id = $1
       RETURNING *`,
      [workerId, docType],
    );
    if (result.rows.length === 0) throw new Error('Worker documents not found');
    return this.mapToEntity(result.rows[0]);
  }

  /** Convert the snake_case JSONB map from the DB into the camelCase DocumentValidations type. */
  private mapDocumentValidations(raw: Record<string, { validated_by: string; validated_at: string }> | null): DocumentValidations {
    if (!raw) return {};
    const result: DocumentValidations = {};
    for (const [key, val] of Object.entries(raw)) {
      result[key as keyof DocumentValidations] = {
        validatedBy: val.validated_by,
        validatedAt: val.validated_at,
      };
    }
    return result;
  }

  private mapToEntity(row: any): WorkerDocuments {
    return {
      id: row.id,
      workerId: row.worker_id,
      resumeCvUrl: row.resume_cv_url,
      identityDocumentUrl: row.identity_document_url,
      identityDocumentBackUrl: row.identity_document_back_url,
      criminalRecordUrl: row.criminal_record_url,
      professionalRegistrationUrl: row.professional_registration_url,
      liabilityInsuranceUrl: row.liability_insurance_url,
      monotributoCertificateUrl: row.monotributo_certificate_url,
      atCertificateUrl: row.at_certificate_url,
      additionalCertificatesUrls: row.additional_certificates_urls || [],
      documentsStatus: row.documents_status as DocumentsStatus,
      documentValidations: this.mapDocumentValidations(row.document_validations),
      reviewNotes: row.review_notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      resubmittedAt: row.resubmitted_at ? new Date(row.resubmitted_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private async getWorkerProfession(workerId: string): Promise<string | null> {
    const result = await this.pool.query('SELECT profession FROM workers WHERE id = $1', [workerId]);
    return result.rows[0]?.profession ?? null;
  }

  /**
   * Compute documents_status based on filled docs and worker profession.
   * DNI front + back count only when both are present.
   * AT workers additionally require monotributo + AT certificate.
   */
  private computeStatus(
    docs: Record<string, unknown>,
    profession: string | null,
  ): DocumentsStatus {
    const hasFront = !!docs.identityDocumentUrl;
    const hasBack = !!docs.identityDocumentBackUrl;
    const dniPairComplete = hasFront && hasBack;

    // Count base docs (DNI pair counts as 2 when complete, 0 when incomplete)
    let filled = 0;
    if (docs.resumeCvUrl) filled++;
    if (dniPairComplete) filled += 2; // front + back
    if (docs.criminalRecordUrl) filled++;
    if (docs.professionalRegistrationUrl) filled++;
    if (docs.liabilityInsuranceUrl) filled++;

    let threshold = 6; // base: 5 original + dorso DNI

    if (profession === 'AT') {
      threshold = 8;
      if (docs.monotributoCertificateUrl) filled++;
      if (docs.atCertificateUrl) filled++;
    }

    if (filled === 0) return 'pending';
    if (filled < threshold) return 'incomplete';
    return 'submitted';
  }

  /** Merge DTO over existing entity for status computation. */
  private mergeForStatus(
    dto: UpdateWorkerDocumentsDTO,
    existing: WorkerDocuments,
  ): Record<string, string | undefined> {
    return {
      resumeCvUrl: dto.resumeCvUrl || existing.resumeCvUrl,
      identityDocumentUrl: dto.identityDocumentUrl || existing.identityDocumentUrl,
      identityDocumentBackUrl: dto.identityDocumentBackUrl || existing.identityDocumentBackUrl,
      criminalRecordUrl: dto.criminalRecordUrl || existing.criminalRecordUrl,
      professionalRegistrationUrl: dto.professionalRegistrationUrl || existing.professionalRegistrationUrl,
      liabilityInsuranceUrl: dto.liabilityInsuranceUrl || existing.liabilityInsuranceUrl,
      monotributoCertificateUrl: dto.monotributoCertificateUrl || existing.monotributoCertificateUrl,
      atCertificateUrl: dto.atCertificateUrl || existing.atCertificateUrl,
    };
  }
}
