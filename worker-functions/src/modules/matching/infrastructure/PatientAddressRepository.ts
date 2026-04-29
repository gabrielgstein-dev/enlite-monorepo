import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';

/**
 * PatientAddressRepository
 *
 * Handles patient_addresses persistence used by the ClickUp sync pipeline.
 * Extracted from JobPostingARRepository to respect the 400-line limit.
 */
export class PatientAddressRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  /**
   * Resolves or creates a patient_addresses row for a given patient + address text.
   *
   * Logic:
   * 1. If both addressFormatted and addressRaw are null → return null.
   * 2. Try exact match on address_formatted (case-insensitive trim).
   * 3. If not found and addressFormatted is not null → INSERT new row and return new id.
   * 4. Return matched/created id.
   */
  async resolveOrCreatePatientAddress(params: {
    patientId: string;
    addressFormatted: string | null;
    addressRaw: string | null;
  }): Promise<string | null> {
    const { patientId, addressFormatted, addressRaw } = params;

    if (!addressFormatted && !addressRaw) return null;

    if (addressFormatted) {
      const existing = await this.pool.query<{ id: string }>(
        `SELECT id
         FROM patient_addresses
         WHERE patient_id = $1
           AND TRIM(LOWER(address_formatted)) = TRIM(LOWER($2))
         LIMIT 1`,
        [patientId, addressFormatted],
      );

      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }

      // Not found → create new patient_addresses row
      const inserted = await this.pool.query<{ id: string }>(
        `INSERT INTO patient_addresses
           (patient_id, address_type, address_formatted, address_raw, display_order, source)
         VALUES ($1, 'service', $2, $3,
           (SELECT COALESCE(MAX(display_order), 0) + 1 FROM patient_addresses WHERE patient_id = $1),
           'clickup_sync')
         RETURNING id`,
        [patientId, addressFormatted, addressRaw ?? null],
      );

      return inserted.rows[0].id;
    }

    // addressRaw only (no formatted address) — try matching on address_raw
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM patient_addresses
       WHERE patient_id = $1
         AND TRIM(LOWER(address_raw)) = TRIM(LOWER($2))
       LIMIT 1`,
      [patientId, addressRaw],
    );

    return existing.rows[0]?.id ?? null;
  }
}
