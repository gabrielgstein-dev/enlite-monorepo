import { Pool } from 'pg';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker, WorkerStatus, CreateWorkerDTO, SavePersonalInfoDTO } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { KMSEncryptionService } from '../security/KMSEncryptionService';
import { updatePersonalInfo as _updatePersonalInfo } from './WorkerPersonalInfoRepository';
import {
  findByCuit as _findByCuit,
  updateFromImport as _updateFromImport,
  addDataSource as _addDataSource,
  recalculateStatus as _recalculateStatus,
  WorkerImportData,
} from './WorkerImportRepository';

export class WorkerRepository implements IWorkerRepository {
  private pool: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  async create(data: CreateWorkerDTO): Promise<Result<Worker>> {
    try {
      const consentAt = data.lgpdOptIn ? new Date() : null;
      const whatsappPhoneEnc = await this.encryptionService.encrypt(data.whatsappPhone || null);
      const query = `
        INSERT INTO workers (auth_uid, email, phone, whatsapp_phone_encrypted, lgpd_consent_at, terms_accepted_at, privacy_accepted_at, country, timezone, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INCOMPLETE_REGISTER')
        RETURNING id, auth_uid as "authUid", email, phone,
                  lgpd_consent_at as "lgpdConsentAt",
                  terms_accepted_at as "termsAcceptedAt",
                  privacy_accepted_at as "privacyAcceptedAt",
                  country, timezone,
                  created_at as "createdAt",
                  updated_at as "updatedAt"
      `;

      const values = [
        data.authUid,
        data.email,
        data.phone || null,
        whatsappPhoneEnc,
        consentAt,
        consentAt,
        consentAt,
        data.country || 'AR',
        data.timezone || 'UTC',
      ];
      const result = await this.pool.query(query, values);
      const row = result.rows[0];
      row.whatsappPhone = data.whatsappPhone || undefined;

      return Result.ok<Worker>(row);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to create worker: ${error.message}`);
    }
  }

  async findById(id: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT id, auth_uid as "authUid", email, phone,
               whatsapp_phone_encrypted as "whatsappPhoneEnc",
               lgpd_consent_at as "lgpdConsentAt",
               country, timezone,
               created_at as "createdAt", updated_at as "updatedAt"
        FROM workers
        WHERE id = $1
      `;

      const result = await this.pool.query(query, [id]);

      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }

      const row = result.rows[0];
      row.whatsappPhone = (await this.encryptionService.decrypt(row.whatsappPhoneEnc)) || undefined;
      delete row.whatsappPhoneEnc;

      return Result.ok<Worker>(row);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async findByAuthUid(authUid: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT
          w.id, w.auth_uid as "authUid", w.email, w.phone,
          w.whatsapp_phone_encrypted as "whatsappPhoneEnc",
          w.lgpd_consent_at as "lgpdConsentAt",
          w.first_name_encrypted as "firstNameEnc",
          w.last_name_encrypted as "lastNameEnc",
          w.sex_encrypted as "sexEnc",
          w.gender_encrypted as "genderEnc",
          w.birth_date_encrypted as "birthDateEnc",
          w.document_type as "documentType",
          w.document_number_encrypted as "documentNumberEnc",
          w.profile_photo_url_encrypted as "profilePhotoUrlEnc",
          w.languages_encrypted as "languagesEnc",
          w.profession, w.knowledge_level as "knowledgeLevel",
          w.title_certificate as "titleCertificate",
          w.experience_types as "experienceTypes",
          w.years_experience as "yearsExperience",
          w.preferred_types as "preferredTypes",
          w.preferred_age_range as "preferredAgeRange",
          w.country, w.timezone,
          w.created_at as "createdAt", w.updated_at as "updatedAt",
          sa.address_line as "serviceAddress",
          sa.address_complement as "serviceAddressComplement",
          sa.city as "serviceCity", sa.state as "serviceState",
          sa.country as "serviceCountry", sa.postal_code as "servicePostalCode",
          sa.radius_km as "serviceRadiusKm",
          sa.latitude as "serviceLat", sa.longitude as "serviceLng",
          sa.neighborhood as "serviceNeighborhood"
        FROM workers w
        LEFT JOIN worker_service_areas sa ON sa.worker_id = w.id
        WHERE w.auth_uid = $1
        GROUP BY w.id, sa.id
      `;

      const result = await this.pool.query(query, [authUid]);

      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }

      const row = result.rows[0];

      // Descriptografar todos os campos PII/PHI em paralelo
      const [firstName, lastName, sex, gender, birthDateStr, documentNumber, profilePhotoUrl, languagesStr, whatsappPhone] =
        await Promise.all([
          this.encryptionService.decrypt(row.firstNameEnc || ''),
          this.encryptionService.decrypt(row.lastNameEnc || ''),
          this.encryptionService.decrypt(row.sexEnc || ''),
          this.encryptionService.decrypt(row.genderEnc || ''),
          this.encryptionService.decrypt(row.birthDateEnc || ''),
          this.encryptionService.decrypt(row.documentNumberEnc || ''),
          this.encryptionService.decrypt(row.profilePhotoUrlEnc || ''),
          this.encryptionService.decrypt(row.languagesEnc || ''),
          this.encryptionService.decrypt(row.whatsappPhoneEnc || ''),
        ]);

      const worker = {
        id: row.id, authUid: row.authUid, email: row.email,
        phone: row.phone || undefined,
        whatsappPhone: whatsappPhone || undefined,
        lgpdConsentAt: row.lgpdConsentAt || undefined,
        firstName: firstName || undefined, lastName: lastName || undefined,
        sex: sex || undefined, gender: gender || undefined,
        birthDate: birthDateStr ? new Date(birthDateStr) : undefined,
        documentType: row.documentType || undefined,
        documentNumber: documentNumber || undefined,
        profilePhotoUrl: profilePhotoUrl || undefined,
        languages: languagesStr ? JSON.parse(languagesStr) : [],
        profession: row.profession || undefined,
        knowledgeLevel: row.knowledgeLevel || undefined,
        titleCertificate: row.titleCertificate || undefined,
        experienceTypes: row.experienceTypes || [],
        yearsExperience: row.yearsExperience || undefined,
        preferredTypes: row.preferredTypes || [],
        preferredAgeRange: row.preferredAgeRange || [],
        country: row.country, timezone: row.timezone,
        createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
        serviceAddress: row.serviceAddress || undefined,
        serviceAddressComplement: row.serviceAddressComplement || undefined,
        serviceCity: row.serviceCity || undefined,
        serviceState: row.serviceState || undefined,
        serviceCountry: row.serviceCountry || undefined,
        servicePostalCode: row.servicePostalCode || undefined,
        serviceRadiusKm: row.serviceRadiusKm || undefined,
        serviceLat: row.serviceLat != null ? parseFloat(row.serviceLat) : undefined,
        serviceLng: row.serviceLng != null ? parseFloat(row.serviceLng) : undefined,
        serviceNeighborhood: row.serviceNeighborhood || undefined,
        availability: row.availability || [],
      };

      return Result.ok<Worker>(worker as unknown as Worker);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async findByEmail(email: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT id, auth_uid as "authUid", email, phone,
               whatsapp_phone_encrypted as "whatsappPhoneEnc",
               lgpd_consent_at as "lgpdConsentAt",
               country, timezone,
               created_at as "createdAt", updated_at as "updatedAt"
        FROM workers WHERE email = $1
      `;

      const result = await this.pool.query(query, [email]);

      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }

      const row = result.rows[0];
      row.whatsappPhone = (await this.encryptionService.decrypt(row.whatsappPhoneEnc)) || undefined;
      delete row.whatsappPhoneEnc;

      return Result.ok<Worker>(row);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async updatePersonalInfo(
    data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & {
      termsAccepted: boolean;
      privacyAccepted: boolean;
    },
  ): Promise<Result<Worker>> {
    return _updatePersonalInfo(this.pool, this.encryptionService, data);
  }

  async delete(workerId: string): Promise<Result<void>> {
    try {
      const query = 'DELETE FROM workers WHERE id = $1';
      await this.pool.query(query, [workerId]);
      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to delete worker: ${error.message}`);
    }
  }

  async deleteByAuthUid(authUid: string): Promise<Result<void>> {
    try {
      const query = 'DELETE FROM workers WHERE auth_uid = $1';
      await this.pool.query(query, [authUid]);
      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to delete worker: ${error.message}`);
    }
  }

  async updateAuthUid(workerId: string, authUid: string, phone?: string): Promise<Result<Worker>> {
    try {
      // When a phone is provided, also set it (used to fill missing phone on email reconciliation)
      const query = phone
        ? `UPDATE workers
           SET auth_uid = $1, phone = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING id, auth_uid as "authUid", email, phone,
                     whatsapp_phone_encrypted as "whatsappPhoneEnc",
                     lgpd_consent_at as "lgpdConsentAt",
                     country, timezone, status,
                     created_at as "createdAt", updated_at as "updatedAt"`
        : `UPDATE workers
           SET auth_uid = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, auth_uid as "authUid", email, phone,
                     whatsapp_phone_encrypted as "whatsappPhoneEnc",
                     lgpd_consent_at as "lgpdConsentAt",
                     country, timezone, status,
                     created_at as "createdAt", updated_at as "updatedAt"`;

      const params = phone ? [authUid, phone, workerId] : [authUid, workerId];
      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        return Result.fail<Worker>('Worker not found');
      }

      const row = result.rows[0];
      row.whatsappPhone = (await this.encryptionService.decrypt(row.whatsappPhoneEnc)) || undefined;
      delete row.whatsappPhoneEnc;

      return Result.ok<Worker>(row);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to update worker auth_uid: ${error.message}`);
    }
  }

  async findByPhone(phone: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT id, auth_uid as "authUid", email, phone, country,
               created_at as "createdAt", updated_at as "updatedAt"
        FROM workers WHERE phone = $1
      `;
      const result = await this.pool.query(query, [phone]);
      if (result.rows.length === 0) return Result.ok<Worker | null>(null);
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker by phone: ${error.message}`);
    }
  }

  async findByPhoneCandidates(candidates: string[]): Promise<Result<Worker | null>> {
    try {
      if (candidates.length === 0) return Result.ok<Worker | null>(null);
      const query = `
        SELECT id, auth_uid as "authUid", email, phone, country,
               created_at as "createdAt", updated_at as "updatedAt"
        FROM workers WHERE phone = ANY($1::text[])
        LIMIT 1
      `;
      const result = await this.pool.query(query, [candidates]);
      if (result.rows.length === 0) return Result.ok<Worker | null>(null);
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker by phone: ${error.message}`);
    }
  }

  /** Busca worker pelo CUIT/CUIL (identificador fiscal argentino, 11 dígitos). */
  async findByCuit(cuit: string): Promise<Result<Worker | null>> {
    return _findByCuit(this.pool, cuit);
  }

  async updateFromImport(workerId: string, data: WorkerImportData): Promise<void> {
    return _updateFromImport(this.pool, this.encryptionService, workerId, data, (id) =>
      this.recalculateStatus(id),
    );
  }

  /** Registra qual import contribuiu dados para este worker (sem duplicar na array). */
  async addDataSource(workerId: string, source: string): Promise<void> {
    return _addDataSource(this.pool, workerId, source);
  }

  /**
   * Updates worker status inside a transaction so the trigger
   * trg_worker_status_history fires and records the transition.
   */
  async updateStatus(workerId: string, status: WorkerStatus): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE workers SET status = $2, updated_at = NOW() WHERE id = $1',
        [workerId, status],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Delega para WorkerImportRepository para manter o arquivo sob 400 linhas. */
  async recalculateStatus(workerId: string): Promise<WorkerStatus | null> {
    return _recalculateStatus(this.pool, workerId, (id, s) => this.updateStatus(id, s));
  }

  async updateImportedWorkerData(
    workerId: string,
    data: { authUid: string; email: string },
  ): Promise<Result<Worker>> {
    try {
      const query = `
        UPDATE workers
        SET auth_uid = $1, email = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, auth_uid as "authUid", email, phone,
                  whatsapp_phone_encrypted as "whatsappPhoneEnc",
                  lgpd_consent_at as "lgpdConsentAt",
                  country, timezone, status,
                  created_at as "createdAt", updated_at as "updatedAt"
      `;

      const result = await this.pool.query(query, [data.authUid, data.email, workerId]);

      if (result.rows.length === 0) {
        return Result.fail<Worker>('Worker not found');
      }

      const row = result.rows[0];
      row.whatsappPhone = (await this.encryptionService.decrypt(row.whatsappPhoneEnc)) || undefined;
      delete row.whatsappPhoneEnc;

      return Result.ok<Worker>(row);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to update imported worker: ${error.message}`);
    }
  }
}
