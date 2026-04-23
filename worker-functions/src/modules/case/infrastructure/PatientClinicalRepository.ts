import { Pool, PoolClient } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { PatientClinical } from '../domain/PatientClinical';

export interface PatientClinicalUpsertInput {
  patientId: string;
  diagnosis?: string | null;
  dependencyLevel?: string | null;
  clinicalSegments?: string | null;
  serviceType?: string | null;
  deviceType?: string | null;
  additionalComments?: string | null;
  hasJudicialProtection?: boolean | null;
  hasCud?: boolean | null;
  hasConsent?: boolean | null;
}

/**
 * PatientClinicalRepository — persists clinical fields of a patient.
 * Backed by Postgres TODAY. Future: Healthcare API (month 9).
 * Does NOT join workers, job_postings, or any domain outside patient.
 */
export class PatientClinicalRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async upsert(
    input: PatientClinicalUpsertInput,
    client?: PoolClient,
  ): Promise<void> {
    const executor = client ?? this.pool;

    await executor.query(
      `UPDATE patients SET
        diagnosis               = $2,
        dependency_level        = $3,
        clinical_segments       = $4,
        service_type            = $5,
        device_type             = $6,
        additional_comments     = $7,
        has_judicial_protection = $8,
        has_cud                 = $9,
        has_consent             = $10,
        updated_at              = NOW()
       WHERE id = $1`,
      [
        input.patientId,
        input.diagnosis              ?? null,
        input.dependencyLevel        ?? null,
        input.clinicalSegments       ?? null,
        input.serviceType            ?? null,
        input.deviceType             ?? null,
        input.additionalComments     ?? null,
        input.hasJudicialProtection  ?? null,
        input.hasCud                 ?? null,
        input.hasConsent             ?? null,
      ],
    );
  }

  async findByPatientId(patientId: string): Promise<PatientClinical | null> {
    const result = await this.pool.query<PatientClinical>(
      `SELECT
        id AS "patientId",
        diagnosis, dependency_level AS "dependencyLevel",
        clinical_segments AS "clinicalSegments",
        service_type AS "serviceType", device_type AS "deviceType",
        additional_comments AS "additionalComments",
        has_judicial_protection AS "hasJudicialProtection",
        has_cud AS "hasCud", has_consent AS "hasConsent"
       FROM patients WHERE id = $1`,
      [patientId],
    );
    return result.rows[0] ?? null;
  }
}
