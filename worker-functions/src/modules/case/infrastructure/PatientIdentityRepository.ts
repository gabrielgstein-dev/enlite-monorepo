import { Pool, PoolClient } from 'pg';
import { DatabaseConnection } from '../../../infrastructure/database/DatabaseConnection';
import { PatientIdentity } from '../domain/PatientIdentity';

export interface PatientIdentityUpsertInput {
  clickupTaskId: string;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: Date | null;
  documentType?: string | null;
  documentNumber?: string | null;
  affiliateId?: string | null;
  sex?: string | null;
  phoneWhatsapp?: string | null;
  insuranceInformed?: string | null;
  insuranceVerified?: string | null;
  cityLocality?: string | null;
  province?: string | null;
  zoneNeighborhood?: string | null;
  country?: string;
}

/**
 * PatientIdentityRepository — persists non-clinical patient fields.
 * Backed by Postgres (always). Future: remains in case-service MS.
 * Does NOT join workers, job_postings, or any domain outside patient.
 */
export class PatientIdentityRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async upsert(
    input: PatientIdentityUpsertInput,
    client?: PoolClient,
  ): Promise<{ id: string; created: boolean }> {
    const executor = client ?? this.pool;
    const country = input.country ?? 'AR';

    const result = await executor.query<{ id: string; xmax: string }>(
      `INSERT INTO patients (
        clickup_task_id,
        first_name, last_name, birth_date,
        document_type, document_number, affiliate_id,
        sex, phone_whatsapp,
        insurance_informed, insurance_verified,
        city_locality, province, zone_neighborhood,
        country
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (clickup_task_id) DO UPDATE SET
        first_name          = EXCLUDED.first_name,
        last_name           = EXCLUDED.last_name,
        birth_date          = EXCLUDED.birth_date,
        document_type       = EXCLUDED.document_type,
        document_number     = EXCLUDED.document_number,
        affiliate_id        = EXCLUDED.affiliate_id,
        sex                 = EXCLUDED.sex,
        phone_whatsapp      = EXCLUDED.phone_whatsapp,
        insurance_informed  = EXCLUDED.insurance_informed,
        insurance_verified  = EXCLUDED.insurance_verified,
        city_locality       = EXCLUDED.city_locality,
        province            = EXCLUDED.province,
        zone_neighborhood   = EXCLUDED.zone_neighborhood,
        updated_at          = NOW()
      RETURNING id, xmax::text`,
      [
        input.clickupTaskId,
        input.firstName        ?? null,
        input.lastName         ?? null,
        input.birthDate        ?? null,
        input.documentType     ?? null,
        input.documentNumber   ?? null,
        input.affiliateId      ?? null,
        input.sex              ?? null,
        input.phoneWhatsapp    ?? null,
        input.insuranceInformed ?? null,
        input.insuranceVerified ?? null,
        input.cityLocality      ?? null,
        input.province          ?? null,
        input.zoneNeighborhood  ?? null,
        country,
      ],
    );

    const row = result.rows[0];
    return { id: row.id, created: row.xmax === '0' };
  }

  async findById(id: string): Promise<PatientIdentity | null> {
    const result = await this.pool.query<PatientIdentity>(
      `SELECT
        id, clickup_task_id AS "clickupTaskId",
        first_name AS "firstName", last_name AS "lastName",
        birth_date AS "birthDate", document_type AS "documentType",
        document_number AS "documentNumber", affiliate_id AS "affiliateId",
        sex, phone_whatsapp AS "phoneWhatsapp",
        insurance_informed AS "insuranceInformed",
        insurance_verified AS "insuranceVerified",
        city_locality AS "cityLocality", province,
        zone_neighborhood AS "zoneNeighborhood",
        country, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM patients WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
