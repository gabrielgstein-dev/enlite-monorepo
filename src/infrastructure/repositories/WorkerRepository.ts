import { Pool } from 'pg';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker, CreateWorkerDTO, UpdateWorkerStepDTO, SavePersonalInfoDTO } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { KMSEncryptionService } from '../security/KMSEncryptionService';

export class WorkerRepository implements IWorkerRepository {
  private pool: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  async create(data: CreateWorkerDTO): Promise<Result<Worker>> {
    try {
      const lgpdConsentAt = data.lgpdOptIn ? new Date() : null;
      const query = `
        INSERT INTO workers (auth_uid, email, phone, whatsapp_phone, lgpd_consent_at, country, timezone)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, auth_uid as "authUid", email, phone,
                  whatsapp_phone as "whatsappPhone",
                  lgpd_consent_at as "lgpdConsentAt",
                  country, timezone,
                  current_step as "currentStep", status, created_at as "createdAt", 
                  updated_at as "updatedAt"
      `;
      
      const values = [
        data.authUid,
        data.email,
        data.phone || null,
        data.whatsappPhone || null,
        lgpdConsentAt,
        data.country || 'AR',
        data.timezone || 'UTC',
      ];
      const result = await this.pool.query(query, values);
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to create worker: ${error.message}`);
    }
  }

  async findById(id: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT id, auth_uid as "authUid", email, phone,
               whatsapp_phone as "whatsappPhone",
               lgpd_consent_at as "lgpdConsentAt",
               country, timezone,
               current_step as "currentStep", status, 
               registration_completed as "registrationCompleted",
               created_at as "createdAt", updated_at as "updatedAt"
        FROM workers
        WHERE id = $1
      `;
      
      const result = await this.pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async findByAuthUid(authUid: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT 
          w.id, 
          w.auth_uid as "authUid", 
          w.email, 
          w.phone,
          w.whatsapp_phone as "whatsappPhone",
          w.lgpd_consent_at as "lgpdConsentAt",
          w.first_name as "firstName",
          w.last_name as "lastName",
          w.sex,
          w.gender,
          w.birth_date as "birthDate",
          w.document_type as "documentType",
          w.document_number as "documentNumber",
          w.profile_photo_url as "profilePhotoUrl",
          w.languages,
          w.profession,
          w.knowledge_level as "knowledgeLevel",
          w.title_certificate as "titleCertificate",
          w.experience_types as "experienceTypes",
          w.years_experience as "yearsExperience",
          w.preferred_types as "preferredTypes",
          w.preferred_age_range as "preferredAgeRange",
          w.country, 
          w.timezone,
          w.current_step as "currentStep", 
          w.status,
          w.registration_completed as "registrationCompleted",
          w.created_at as "createdAt", 
          w.updated_at as "updatedAt",
          sa.address_line as "serviceAddress",
          sa.address_complement as "serviceAddressComplement",
          sa.city as "serviceCity",
          sa.state as "serviceState",
          sa.country as "serviceCountry",
          sa.postal_code as "servicePostalCode",
          sa.radius_km as "serviceRadiusKm",
          COALESCE(
            json_agg(
              json_build_object(
                'dayOfWeek', wa.day_of_week,
                'startTime', wa.start_time,
                'endTime', wa.end_time,
                'crossesMidnight', wa.crosses_midnight
              )
            ) FILTER (WHERE wa.id IS NOT NULL),
            '[]'::json
          ) as "availability"
        FROM workers w
        LEFT JOIN worker_service_areas sa ON sa.worker_id = w.id
        LEFT JOIN worker_availability wa ON wa.worker_id = w.id
        WHERE w.auth_uid = $1
        GROUP BY w.id, sa.id
      `;
      
      const result = await this.pool.query(query, [authUid]);
      
      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async findByEmail(email: string): Promise<Result<Worker | null>> {
    try {
      const query = `
        SELECT id, auth_uid as "authUid", email, phone,
               whatsapp_phone as "whatsappPhone",
               lgpd_consent_at as "lgpdConsentAt",
               country, timezone,
               current_step as "currentStep", status, created_at as "createdAt",
               updated_at as "updatedAt"
        FROM workers
        WHERE email = $1
      `;
      
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return Result.ok<Worker | null>(null);
      }
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker: ${error.message}`);
    }
  }

  async updateStep(data: UpdateWorkerStepDTO): Promise<Result<Worker>> {
    try {
      // Mark registration as completed when reaching step 5 (after availability/step 3)
      const registrationCompleted = data.step >= 5;
      
      const query = `
        UPDATE workers
        SET current_step = $1, status = COALESCE($2, status), registration_completed = $4
        WHERE id = $3
        RETURNING id, auth_uid as "authUid", email, phone, country, timezone,
                  current_step as "currentStep", status, registration_completed as "registrationCompleted",
                  created_at as "createdAt", updated_at as "updatedAt"
      `;
      
      const values = [data.step, data.status || null, data.workerId, registrationCompleted];
      const result = await this.pool.query(query, values);
      
      if (result.rows.length === 0) {
        return Result.fail<Worker>('Worker not found');
      }
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to update worker step: ${error.message}`);
    }
  }

  async updateStatus(workerId: string, status: string): Promise<Result<Worker>> {
    try {
      const query = `
        UPDATE workers
        SET status = $1
        WHERE id = $2
        RETURNING id, auth_uid as "authUid", email, phone, country, timezone,
                  current_step as "currentStep", status, created_at as "createdAt",
                  updated_at as "updatedAt"
      `;
      
      const result = await this.pool.query(query, [status, workerId]);
      
      if (result.rows.length === 0) {
        return Result.fail<Worker>('Worker not found');
      }
      
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to update worker status: ${error.message}`);
    }
  }

  async updatePersonalInfo(data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & { 
    termsAccepted: boolean; 
    privacyAccepted: boolean; 
  }): Promise<Result<Worker>> {
    try {
      // Criptografar TODOS os campos sensíveis (PHI/PII) com KMS
      // HIPAA 18 Identifiers: Names, Dates, Phone, Email, Document numbers, Photos, Demographics
      const encryptedFirstName = await this.encryptionService.encrypt(data.firstName);
      const encryptedLastName = await this.encryptionService.encrypt(data.lastName);
      const encryptedBirthDate = await this.encryptionService.encrypt(data.birthDate);
      const encryptedSex = await this.encryptionService.encrypt(data.sex);
      const encryptedGender = await this.encryptionService.encrypt(data.gender);
      const encryptedPhone = await this.encryptionService.encrypt(data.phone);
      const encryptedDocumentNumber = await this.encryptionService.encrypt(data.documentNumber);
      const encryptedPhotoUrl = await this.encryptionService.encrypt(data.profilePhotoUrl || '');
      const encryptedLanguages = await this.encryptionService.encrypt(JSON.stringify(data.languages || []));

      const query = `
        UPDATE workers SET
          first_name_encrypted = $2,
          last_name_encrypted = $3,
          sex_encrypted = $4,
          gender_encrypted = $5,
          birth_date_encrypted = $6,
          document_type = $7,
          document_number_encrypted = $8,
          phone_encrypted = $9,
          profile_photo_url_encrypted = $10,
          languages_encrypted = $11,
          profession = $12,
          knowledge_level = $13,
          title_certificate = $14,
          experience_types = $15,
          years_experience = $16,
          preferred_types = $17,
          preferred_age_range = $18,
          terms_accepted_at = CASE WHEN $19 THEN NOW() ELSE terms_accepted_at END,
          privacy_accepted_at = CASE WHEN $20 THEN NOW() ELSE privacy_accepted_at END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING 
          id,
          auth_uid as "authUid",
          first_name_encrypted as "firstNameEncrypted",
          last_name_encrypted as "lastNameEncrypted",
          sex_encrypted as "sexEncrypted",
          gender_encrypted as "genderEncrypted",
          birth_date_encrypted as "birthDateEncrypted",
          document_type as "documentType",
          document_number_encrypted as "documentNumberEncrypted",
          phone_encrypted as "phoneEncrypted",
          profile_photo_url_encrypted as "profilePhotoUrlEncrypted",
          languages_encrypted as "languagesEncrypted",
          profession,
          knowledge_level as "knowledgeLevel",
          title_certificate as "titleCertificate",
          experience_types as "experienceTypes",
          years_experience as "yearsExperience",
          preferred_types as "preferredTypes",
          preferred_age_range as "preferredAgeRange",
          current_step as "currentStep",
          status,
          country,
          terms_accepted_at as "termsAcceptedAt",
          privacy_accepted_at as "privacyAcceptedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;

      const values = [
        data.workerId,
        encryptedFirstName,
        encryptedLastName,
        encryptedSex,
        encryptedGender,
        encryptedBirthDate,
        data.documentType,
        encryptedDocumentNumber,
        encryptedPhone,
        encryptedPhotoUrl,
        encryptedLanguages,
        data.profession,
        data.knowledgeLevel,
        data.titleCertificate,
        data.experienceTypes,
        data.yearsExperience,
        data.preferredTypes,
        data.preferredAgeRange,
        data.termsAccepted,
        data.privacyAccepted,
      ];

      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        return Result.fail<Worker>('Worker not found');
      }

      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker>(`Failed to update personal info: ${error.message}`);
    }
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
}
