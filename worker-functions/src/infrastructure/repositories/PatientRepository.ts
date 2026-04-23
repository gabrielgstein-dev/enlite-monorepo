/**
 * @deprecated Use `PatientService` from `src/modules/case` instead.
 * This file is a compatibility shim kept to avoid breaking existing callers
 * while the migration to the case module is in progress.
 * Will be removed once import-planilhas.ts is fully migrated (M137 cutover).
 */
import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { KMSEncryptionService } from '../security/KMSEncryptionService';

export interface PatientAddress {
  addressType: string;         // 'primary' | 'secondary' | 'tertiary'
  addressFormatted?: string | null;  // ClickUp location field (formatted)
  addressRaw?: string | null;        // Domicilio Informado (free text)
  displayOrder: number;
}

export interface PatientProfessional {
  name: string;
  phone?: string | null;
  email?: string | null;
  displayOrder: number;
  isTeam?: boolean;  // true = equipo multidisciplinario entry
}

export interface PatientClickUpData {
  clickupTaskId: string;

  // Identity
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: Date | null;
  documentType?: string | null;
  documentNumber?: string | null;
  affiliateId?: string | null;
  sex?: string | null;
  phoneWhatsapp?: string | null;

  // Clinical (critical for worker matching)
  diagnosis?: string | null;
  dependencyLevel?: string | null;
  clinicalSegments?: string | null;
  serviceType?: string | null;
  deviceType?: string | null;
  additionalComments?: string | null;
  hasJudicialProtection?: boolean | null;
  hasCud?: boolean | null;
  hasConsent?: boolean | null;

  // Insurance
  insuranceInformed?: string | null;
  insuranceVerified?: string | null;

  // General location (kept on patient for quick matching)
  cityLocality?: string | null;
  province?: string | null;
  zoneNeighborhood?: string | null;

  // Responsible person
  responsibleFirstName?: string | null;
  responsibleLastName?: string | null;
  responsibleRelationship?: string | null;
  responsiblePhone?: string | null;
  responsibleDocumentType?: string | null;
  responsibleDocumentNumber?: string | null;

  // Related records (saved via separate replace calls)
  addresses?: PatientAddress[];
  professionals?: PatientProfessional[];

  country?: string;
}

export class PatientRepository {
  private pool: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  /**
   * Upsert a patient from ClickUp data.
   * Key: clickup_task_id (1 ClickUp task = 1 case = 1 patient context).
   * After upserting, replaces addresses and professionals if provided.
   */
  async upsertFromClickUp(data: PatientClickUpData): Promise<{ id: string; created: boolean }> {
    const country = data.country ?? 'AR';

    const result = await this.pool.query<{ id: string; xmax: string }>(
      `INSERT INTO patients (
        clickup_task_id,
        first_name, last_name, birth_date, document_type, document_number,
        affiliate_id, sex, phone_whatsapp,
        diagnosis, dependency_level, clinical_segments, service_type, device_type,
        additional_comments, has_judicial_protection, has_cud, has_consent,
        insurance_informed, insurance_verified,
        city_locality, province, zone_neighborhood,
        responsible_first_name, responsible_last_name, responsible_relationship,
        responsible_phone, responsible_document_type, responsible_document_number,
        country
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      )
      ON CONFLICT (clickup_task_id) DO UPDATE SET
        first_name                  = EXCLUDED.first_name,
        last_name                   = EXCLUDED.last_name,
        birth_date                  = EXCLUDED.birth_date,
        document_type               = EXCLUDED.document_type,
        document_number             = EXCLUDED.document_number,
        affiliate_id                = EXCLUDED.affiliate_id,
        sex                         = EXCLUDED.sex,
        phone_whatsapp              = EXCLUDED.phone_whatsapp,
        diagnosis                   = EXCLUDED.diagnosis,
        dependency_level            = EXCLUDED.dependency_level,
        clinical_segments           = EXCLUDED.clinical_segments,
        service_type                = EXCLUDED.service_type,
        device_type                 = EXCLUDED.device_type,
        additional_comments         = EXCLUDED.additional_comments,
        has_judicial_protection     = EXCLUDED.has_judicial_protection,
        has_cud                     = EXCLUDED.has_cud,
        has_consent                 = EXCLUDED.has_consent,
        insurance_informed          = EXCLUDED.insurance_informed,
        insurance_verified          = EXCLUDED.insurance_verified,
        city_locality               = EXCLUDED.city_locality,
        province                    = EXCLUDED.province,
        zone_neighborhood           = EXCLUDED.zone_neighborhood,
        responsible_first_name      = EXCLUDED.responsible_first_name,
        responsible_last_name       = EXCLUDED.responsible_last_name,
        responsible_relationship    = EXCLUDED.responsible_relationship,
        responsible_phone           = EXCLUDED.responsible_phone,
        responsible_document_type   = EXCLUDED.responsible_document_type,
        responsible_document_number = EXCLUDED.responsible_document_number,
        updated_at                  = NOW()
      RETURNING id, xmax::text`,
      [
        data.clickupTaskId,
        data.firstName        ?? null,
        data.lastName         ?? null,
        data.birthDate        ?? null,
        data.documentType     ?? null,
        data.documentNumber   ?? null,
        data.affiliateId      ?? null,
        data.sex              ?? null,
        data.phoneWhatsapp    ?? null,
        data.diagnosis        ?? null,
        data.dependencyLevel  ?? null,
        data.clinicalSegments ?? null,
        data.serviceType      ?? null,
        data.deviceType       ?? null,
        data.additionalComments      ?? null,
        data.hasJudicialProtection   ?? null,
        data.hasCud                  ?? null,
        data.hasConsent              ?? null,
        data.insuranceInformed       ?? null,
        data.insuranceVerified       ?? null,
        data.cityLocality            ?? null,
        data.province                ?? null,
        data.zoneNeighborhood        ?? null,
        data.responsibleFirstName    ?? null,
        data.responsibleLastName     ?? null,
        data.responsibleRelationship ?? null,
        data.responsiblePhone        ?? null,
        data.responsibleDocumentType   ?? null,
        data.responsibleDocumentNumber ?? null,
        country,
      ]
    );

    const row = result.rows[0];
    const patientId = row.id;
    const created = row.xmax === '0';

    // Replace addresses and professionals atomically
    if (data.addresses !== undefined) {
      await this.replaceAddresses(patientId, data.addresses);
    }
    if (data.professionals !== undefined) {
      await this.replaceProfessionals(patientId, data.professionals);
    }

    return { id: patientId, created };
  }

  /**
   * Replaces all addresses for a patient (DELETE + INSERT).
   * Only called when the import provides address data.
   */
  async replaceAddresses(patientId: string, addresses: PatientAddress[]): Promise<void> {
    await this.pool.query(
      'DELETE FROM patient_addresses WHERE patient_id = $1',
      [patientId]
    );

    const valid = addresses.filter(a => a.addressFormatted || a.addressRaw);
    if (valid.length === 0) return;

    const values: unknown[] = [];
    const placeholders = valid.map((a, i) => {
      const base = i * 5;
      values.push(patientId, a.addressType, a.addressFormatted ?? null, a.addressRaw ?? null, a.displayOrder);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await this.pool.query(
      `INSERT INTO patient_addresses (patient_id, address_type, address_formatted, address_raw, display_order)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  /**
   * Replaces all treating professionals for a patient (DELETE + INSERT).
   * Only called when the import provides professional data.
   */
  async replaceProfessionals(patientId: string, professionals: PatientProfessional[]): Promise<void> {
    await this.pool.query(
      'DELETE FROM patient_professionals WHERE patient_id = $1',
      [patientId]
    );

    const valid = professionals.filter(p => p.name?.trim());
    if (valid.length === 0) return;

    // Encrypt phone and email for each professional in parallel
    const encrypted = await Promise.all(
      valid.map(async p => ({
        phoneEnc: await this.encryptionService.encrypt(p.phone ?? null),
        emailEnc: await this.encryptionService.encrypt(p.email ?? null),
      }))
    );

    const values: unknown[] = [];
    const placeholders = valid.map((p, i) => {
      const base = i * 6;
      values.push(patientId, p.name, encrypted[i].phoneEnc, encrypted[i].emailEnc, p.displayOrder, p.isTeam ?? false);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await this.pool.query(
      `INSERT INTO patient_professionals (patient_id, name, phone_encrypted, email_encrypted, display_order, is_team)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }
}
