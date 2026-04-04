import { Pool } from 'pg';
import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { Worker, WorkerStatus, CreateWorkerDTO, UpdateWorkerStepDTO, SavePersonalInfoDTO } from '../../domain/entities/Worker';
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
      const whatsappPhoneEnc = await this.encryptionService.encrypt(data.whatsappPhone || null);
      const query = `
        INSERT INTO workers (auth_uid, email, phone, whatsapp_phone_encrypted, lgpd_consent_at, country, timezone, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'INCOMPLETE_REGISTER')
        RETURNING id, auth_uid as "authUid", email, phone,
                  lgpd_consent_at as "lgpdConsentAt",
                  country, timezone,
                  created_at as "createdAt",
                  updated_at as "updatedAt"
      `;

      const values = [
        data.authUid,
        data.email,
        data.phone || null,
        whatsappPhoneEnc,
        lgpdConsentAt,
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
          w.id,
          w.auth_uid as "authUid",
          w.email,
          w.phone,
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
          w.profession,
          w.knowledge_level as "knowledgeLevel",
          w.title_certificate as "titleCertificate",
          w.experience_types as "experienceTypes",
          w.years_experience as "yearsExperience",
          w.preferred_types as "preferredTypes",
          w.preferred_age_range as "preferredAgeRange",
          w.country,
          w.timezone,
          w.created_at as "createdAt",
          w.updated_at as "updatedAt",
          sa.address_line as "serviceAddress",
          sa.address_complement as "serviceAddressComplement",
          sa.city as "serviceCity",
          sa.state as "serviceState",
          sa.country as "serviceCountry",
          sa.postal_code as "servicePostalCode",
          sa.radius_km as "serviceRadiusKm"
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

      // Usamos 'as unknown as Worker' porque o resultado inclui campos de service_areas
      // (serviceAddress, serviceCity, etc.) que não estão definidos na interface Worker
      // mas são retornados pela API e esperados pelo frontend.
      const worker = {
        id: row.id,
        authUid: row.authUid,
        email: row.email,
        phone: row.phone || undefined,
        whatsappPhone: whatsappPhone || undefined,
        lgpdConsentAt: row.lgpdConsentAt || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        sex: sex || undefined,
        gender: gender || undefined,
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
        country: row.country,
        timezone: row.timezone,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        serviceAddress: row.serviceAddress || undefined,
        serviceAddressComplement: row.serviceAddressComplement || undefined,
        serviceCity: row.serviceCity || undefined,
        serviceState: row.serviceState || undefined,
        serviceCountry: row.serviceCountry || undefined,
        servicePostalCode: row.servicePostalCode || undefined,
        serviceRadiusKm: row.serviceRadiusKm || undefined,
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
               created_at as "createdAt",
               updated_at as "updatedAt"
        FROM workers
        WHERE email = $1
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

  async updatePersonalInfo(data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & { 
    termsAccepted: boolean; 
    privacyAccepted: boolean; 
  }): Promise<Result<Worker>> {
    try {
      // Criptografar TODOS os campos sensíveis (PHI/PII) com KMS em paralelo
      // HIPAA 18 Identifiers: Names, Dates, Phone, Email, Document numbers, Photos, Demographics
      const [
        encryptedFirstName,
        encryptedLastName,
        encryptedBirthDate,
        encryptedSex,
        encryptedGender,
        encryptedPhone,
        encryptedDocumentNumber,
        encryptedPhotoUrl,
        encryptedLanguages,
      ] = await Promise.all([
        this.encryptionService.encrypt(data.firstName),
        this.encryptionService.encrypt(data.lastName),
        this.encryptionService.encrypt(data.birthDate),
        this.encryptionService.encrypt(data.sex),
        this.encryptionService.encrypt(data.gender),
        this.encryptionService.encrypt(data.phone),
        this.encryptionService.encrypt(data.documentNumber),
        this.encryptionService.encrypt(data.profilePhotoUrl),
        this.encryptionService.encrypt(JSON.stringify(data.languages || [])),
      ]);

      const query = `
        UPDATE workers SET
          first_name_encrypted = $2,
          last_name_encrypted = $3,
          sex_encrypted = $4,
          gender_encrypted = $5,
          birth_date_encrypted = $6,
          document_type = $7,
          document_number_encrypted = $8,
          phone = COALESCE($9, phone),
          phone_encrypted = $10,
          profile_photo_url_encrypted = $11,
          languages_encrypted = $12,
          profession = $13,
          knowledge_level = $14,
          title_certificate = $15,
          experience_types = $16,
          years_experience = $17,
          preferred_types = $18,
          preferred_age_range = $19,
          terms_accepted_at = CASE WHEN $20 THEN NOW() ELSE terms_accepted_at END,
          privacy_accepted_at = CASE WHEN $21 THEN NOW() ELSE privacy_accepted_at END,
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
        data.phone || null,
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

  async updateAuthUid(workerId: string, authUid: string): Promise<Result<Worker>> {
    try {
      const query = `
        UPDATE workers
        SET auth_uid = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, auth_uid as "authUid", email, phone,
                  whatsapp_phone_encrypted as "whatsappPhoneEnc",
                  lgpd_consent_at as "lgpdConsentAt",
                  country, timezone, status,
                  created_at as "createdAt", updated_at as "updatedAt"
      `;

      const result = await this.pool.query(query, [authUid, workerId]);

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
    try {
      const digits = cuit.replace(/\D/g, '');
      const result = await this.pool.query(
        `SELECT id, auth_uid as "authUid", email, phone, country,
                created_at as "createdAt", updated_at as "updatedAt"
         FROM workers
         WHERE replace(cuit, '-', '') = $1
           AND merged_into_id IS NULL`,
        [digits],
      );
      if (result.rows.length === 0) return Result.ok<Worker | null>(null);
      return Result.ok<Worker>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<Worker | null>(`Failed to find worker by cuit: ${error.message}`);
    }
  }

  async updateFromImport(workerId: string, data: Partial<{
    firstName: string | null;
    lastName: string | null;
    birthDate: Date | null;
    sex: string | null;
    occupation: string | null;
    anaCareId: string | null;
    documentType: 'DNI' | 'CUIT' | 'PASSPORT' | null;
    documentNumber: string | null;
    phone: string | null;
    profession: string | null;
    linkedinUrl: string | null;
    branchOffice: string | null;
    /** Email real do worker — substituirá emails gerados (@enlite.import) automaticamente. */
    email: string | null;
  }>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [workerId];
    let idx = 2;

    // Campos não-PII: escritos diretamente em plaintext
    const plainFieldMap: Record<string, string> = {
      occupation: 'occupation',
      anaCareId: 'ana_care_id',
      documentType: 'document_type',
      phone: 'phone',
      profession: 'profession',
      branchOffice: 'branch_office',
    };

    for (const [key, col] of Object.entries(plainFieldMap)) {
      if (key in data && data[key as keyof typeof data] !== undefined) {
        sets.push(`${col} = COALESCE($${idx++}, ${col})`);
        values.push(data[key as keyof typeof data]);
      }
    }

    // Email: atualiza APENAS se o valor recebido é um email real (não gerado)
    // e o email atual no banco é um email de importação (@enlite.import).
    if (data.email && !data.email.endsWith('@enlite.import')) {
      sets.push(`email = CASE WHEN email LIKE '%@enlite.import' THEN $${idx++} ELSE email END`);
      values.push(data.email);
    }

    // Campos PII: criptografar com KMS em BATCH (paralelo) para reduzir latência
    // COALESCE preserva o valor existente se o novo for null (não sobrescreve com null)
    const piiToEncrypt: Record<string, string> = {};
    const piiFieldMap: Array<{ key: keyof typeof data; col: string; batchKey: string }> = [
      { key: 'firstName', col: 'first_name_encrypted', batchKey: 'firstName' },
      { key: 'lastName',  col: 'last_name_encrypted', batchKey: 'lastName' },
      { key: 'sex',       col: 'sex_encrypted', batchKey: 'sex' },
      { key: 'documentNumber', col: 'document_number_encrypted', batchKey: 'documentNumber' },
      { key: 'linkedinUrl', col: 'linkedin_url_encrypted', batchKey: 'linkedinUrl' },
    ];

    // Coletar valores para criptografar em batch
    for (const { key, batchKey } of piiFieldMap) {
      const raw = data[key];
      if (raw !== undefined && raw !== null && raw !== '') {
        piiToEncrypt[batchKey] = String(raw);
      }
    }

    // birthDate: converter para string ISO antes de criptografar
    if (data.birthDate !== undefined && data.birthDate !== null) {
      const dateStr = data.birthDate instanceof Date
        ? data.birthDate.toISOString().split('T')[0]
        : String(data.birthDate);
      piiToEncrypt['birthDate'] = dateStr;
    }

    // Criptografar TODOS os campos PII em paralelo (1 batch ao invés de 6 chamadas sequenciais)
    if (Object.keys(piiToEncrypt).length > 0) {
      const startEncrypt = Date.now();
      const encrypted = await this.encryptionService.encryptBatch(piiToEncrypt);
      const encryptTime = Date.now() - startEncrypt;
      if (encryptTime > 100) {
        console.log(`[WorkerRepo] Batch encrypt ${Object.keys(piiToEncrypt).length} fields took ${encryptTime}ms`);
      }

      // Adicionar valores criptografados ao UPDATE
      for (const { key, col, batchKey } of piiFieldMap) {
        if (batchKey in encrypted && encrypted[batchKey] !== null) {
          sets.push(`${col} = COALESCE($${idx++}, ${col})`);
          values.push(encrypted[batchKey]);
        }
      }

      // birthDate
      if ('birthDate' in encrypted && encrypted.birthDate !== null) {
        sets.push(`birth_date_encrypted = COALESCE($${idx++}, birth_date_encrypted)`);
        values.push(encrypted.birthDate);
      }
    }

    if (sets.length === 0) return;
    await this.pool.query(
      `UPDATE workers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      values
    );
    await this.recalculateStatus(workerId);
  }

  /** Registra qual import contribuiu dados para este worker (sem duplicar na array). */
  async addDataSource(workerId: string, source: string): Promise<void> {
    await this.pool.query(
      `UPDATE workers
       SET data_sources = ARRAY(
         SELECT DISTINCT unnest(array_append(COALESCE(data_sources, '{}'), $2::text))
       )
       WHERE id = $1`,
      [workerId, source],
    );
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

  /**
   * Recalcula workers.status com base nos campos obrigatórios preenchidos.
   * REGISTERED quando TODOS estão presentes; INCOMPLETE_REGISTER caso contrário.
   * Não altera status DISABLED (ação administrativa manual).
   */
  async recalculateStatus(workerId: string): Promise<WorkerStatus | null> {
    const { rows } = await this.pool.query<{ current_status: string; is_complete: boolean }>(
      `SELECT
         w.status AS current_status,
         (
           w.first_name_encrypted IS NOT NULL AND w.first_name_encrypted <> '' AND
           w.last_name_encrypted  IS NOT NULL AND w.last_name_encrypted  <> '' AND
           w.sex_encrypted        IS NOT NULL AND w.sex_encrypted        <> '' AND
           w.gender_encrypted     IS NOT NULL AND w.gender_encrypted     <> '' AND
           w.birth_date_encrypted IS NOT NULL AND w.birth_date_encrypted <> '' AND
           w.document_number_encrypted IS NOT NULL AND w.document_number_encrypted <> '' AND
           w.languages_encrypted  IS NOT NULL AND w.languages_encrypted  <> '' AND
           w.phone IS NOT NULL AND w.phone <> '' AND
           w.profession       IS NOT NULL AND w.profession       <> '' AND
           w.knowledge_level  IS NOT NULL AND w.knowledge_level  <> '' AND
           w.title_certificate IS NOT NULL AND w.title_certificate <> '' AND
           w.years_experience IS NOT NULL AND w.years_experience <> '' AND
           w.experience_types  IS NOT NULL AND array_length(w.experience_types, 1)  > 0 AND
           w.preferred_types   IS NOT NULL AND array_length(w.preferred_types, 1)   > 0 AND
           w.preferred_age_range IS NOT NULL AND array_length(w.preferred_age_range, 1) > 0 AND
           EXISTS (SELECT 1 FROM worker_service_areas sa WHERE sa.worker_id = w.id AND sa.address_line IS NOT NULL AND sa.radius_km IS NOT NULL) AND
           EXISTS (SELECT 1 FROM worker_availability  av WHERE av.worker_id = w.id) AND
           EXISTS (
             SELECT 1 FROM worker_documents wd
             WHERE wd.worker_id = w.id
               AND wd.resume_cv_url              IS NOT NULL
               AND wd.identity_document_url       IS NOT NULL
               AND wd.criminal_record_url         IS NOT NULL
               AND wd.professional_registration_url IS NOT NULL
               AND wd.liability_insurance_url     IS NOT NULL
           )
         ) AS is_complete
       FROM workers w
       WHERE w.id = $1`,
      [workerId],
    );

    if (rows.length === 0) return null;
    const { current_status, is_complete } = rows[0];

    if (current_status === 'DISABLED') return null;

    const newStatus: WorkerStatus = is_complete ? 'REGISTERED' : 'INCOMPLETE_REGISTER';
    if (newStatus === current_status) return null;

    await this.updateStatus(workerId, newStatus);
    return newStatus;
  }

  async updateImportedWorkerData(workerId: string, data: { authUid: string; email: string }): Promise<Result<Worker>> {
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
