import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { KMSEncryptionService } from '../../infrastructure/security/KMSEncryptionService';
import { generatePhoneCandidates } from '../../infrastructure/scripts/import-utils';

const DOCS_COMPLETE_STATUSES = ['submitted', 'under_review', 'approved'];

function mapPlatformLabel(dataSources: string[]): string {
  if (!dataSources || dataSources.length === 0) return 'enlite_app';
  if (dataSources.some(s => s === 'candidatos' || s === 'candidatos_no_terminaron')) return 'talentum';
  if (dataSources.includes('planilla_operativa')) return 'planilla_operativa';
  if (dataSources.includes('ana_care')) return 'ana_care';
  if (dataSources.includes('talent_search')) return 'talent_search';
  return dataSources[0];
}

interface WorkerDateStats {
  today: number;
  yesterday: number;
  sevenDaysAgo: number;
}

// Campos selecionados para detalhe de worker — compartilhado por getWorkerById e getWorkerByPhone
const WORKER_DETAIL_COLS = [
  'w.id, w.email, w.phone, w.country, w.timezone, w.status',
  'w.data_sources, w.created_at, w.updated_at, w.deleted_at',
  'w.document_type, w.profession, w.occupation, w.knowledge_level',
  'w.title_certificate, w.experience_types, w.years_experience',
  'w.preferred_types, w.preferred_age_range, w.hobbies, w.diagnostic_preferences',
  'w.first_name_encrypted, w.last_name_encrypted, w.birth_date_encrypted',
  'w.sex_encrypted, w.gender_encrypted, w.document_number_encrypted',
  'w.profile_photo_url_encrypted, w.languages_encrypted',
  'w.whatsapp_phone_encrypted, w.linkedin_url_encrypted',
  'w.sexual_orientation_encrypted, w.race_encrypted, w.religion_encrypted',
  'w.weight_kg_encrypted, w.height_cm_encrypted',
].join(', ');

/**
 * AdminWorkersController
 *
 * Endpoints:
 * - GET /api/admin/workers            - Lista workers com filtros e paginação
 * - GET /api/admin/workers/stats      - Contagem de cadastros por data
 * - GET /api/admin/workers/by-phone   - Detalhes completos de um worker por telefone
 * - GET /api/admin/workers/:id        - Detalhes completos de um worker por ID
 */
export class AdminWorkersController {
  private db: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  /** GET /api/admin/workers — lista com filtros e paginação */
  async listWorkers(req: Request, res: Response): Promise<void> {
    try {
      const { platform, docs_complete, limit = '20', offset = '0' } = req.query as Record<string, string>;
      const params: unknown[] = [];
      let paramIndex = 1;
      let whereClause = 'WHERE w.merged_into_id IS NULL';

      if (platform) {
        if (platform === 'talentum') {
          whereClause += ` AND (w.data_sources && ARRAY['candidatos', 'candidatos_no_terminaron']::text[])`;
        } else if (platform === 'enlite_app') {
          whereClause += ` AND (w.data_sources IS NULL OR w.data_sources = '{}')`;
        } else {
          whereClause += ` AND ($${paramIndex} = ANY(w.data_sources))`;
          params.push(platform);
          paramIndex++;
        }
      }

      if (docs_complete === 'complete') {
        whereClause += ` AND wd.documents_status = ANY(ARRAY['submitted','under_review','approved'])`;
      } else if (docs_complete === 'incomplete') {
        whereClause += ` AND (wd.documents_status IS NULL OR wd.documents_status NOT IN ('submitted','under_review','approved'))`;
      }

      const baseQuery = `
        SELECT w.id, w.email, w.first_name_encrypted, w.last_name_encrypted,
          w.data_sources, w.created_at,
          COALESCE(wd.documents_status, 'pending') AS documents_status,
          COUNT(DISTINCT e.job_posting_id) FILTER (WHERE e.resultado = 'SELECCIONADO') AS cases_count
        FROM workers w
        LEFT JOIN worker_documents wd ON wd.worker_id = w.id
        LEFT JOIN encuadres e ON e.worker_id = w.id
        ${whereClause}
        GROUP BY w.id, wd.documents_status
      `;

      const countResult = await this.db.query(`SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub`, params);
      const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

      const dataQuery = `${baseQuery} ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));
      const result = await this.db.query(dataQuery, params);

      const decryptedWorkers = await Promise.all(
        result.rows.map(async (row) => {
          const [firstName, lastName] = await Promise.all([
            this.encryptionService.decrypt(row.first_name_encrypted),
            this.encryptionService.decrypt(row.last_name_encrypted),
          ]);
          return {
            id: row.id,
            name: [firstName, lastName].filter(Boolean).join(' ') || row.email,
            email: row.email,
            casesCount: parseInt(row.cases_count ?? '0', 10),
            documentsStatus: row.documents_status,
            documentsComplete: DOCS_COMPLETE_STATUSES.includes(row.documents_status),
            platform: mapPlatformLabel(row.data_sources ?? []),
            createdAt: row.created_at,
          };
        }),
      );

      res.status(200).json({ success: true, data: decryptedWorkers, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
    } catch (error: any) {
      console.error('[AdminWorkersController] listWorkers error:', error);
      res.status(500).json({ success: false, error: 'Failed to list workers', details: error.message });
    }
  }

  /**
   * Descriptografa PII e busca dados relacionados do worker, montando o objeto de resposta completo.
   * Compartilhado por getWorkerById e getWorkerByPhone para evitar duplicação.
   */
  private async buildWorkerDetailResponse(w: Record<string, any>): Promise<Record<string, any>> {
    const [
      firstName, lastName, birthDate, sex, gender, documentNumber,
      profilePhotoUrl, languages, whatsappPhone, linkedinUrl,
      sexualOrientation, race, religion, weightKg, heightCm,
      docsResult, serviceAreasResult, locationResult, encuadresResult,
    ] = await Promise.all([
      this.encryptionService.decrypt(w.first_name_encrypted),
      this.encryptionService.decrypt(w.last_name_encrypted),
      this.encryptionService.decrypt(w.birth_date_encrypted),
      this.encryptionService.decrypt(w.sex_encrypted),
      this.encryptionService.decrypt(w.gender_encrypted),
      this.encryptionService.decrypt(w.document_number_encrypted),
      this.encryptionService.decrypt(w.profile_photo_url_encrypted),
      this.encryptionService.decrypt(w.languages_encrypted),
      this.encryptionService.decrypt(w.whatsapp_phone_encrypted),
      this.encryptionService.decrypt(w.linkedin_url_encrypted),
      this.encryptionService.decrypt(w.sexual_orientation_encrypted),
      this.encryptionService.decrypt(w.race_encrypted),
      this.encryptionService.decrypt(w.religion_encrypted),
      this.encryptionService.decrypt(w.weight_kg_encrypted),
      this.encryptionService.decrypt(w.height_cm_encrypted),
      this.db.query(
        `SELECT id, resume_cv_url, identity_document_url, criminal_record_url,
          professional_registration_url, liability_insurance_url,
          additional_certificates_urls, documents_status, review_notes,
          reviewed_by, reviewed_at, submitted_at
        FROM worker_documents WHERE worker_id = $1`,
        [w.id],
      ),
      this.db.query(
        `SELECT id, address_line, latitude, longitude, radius_km FROM worker_service_areas WHERE worker_id = $1`,
        [w.id],
      ),
      this.db.query(
        `SELECT address, city, work_zone, interest_zone FROM worker_locations WHERE worker_id = $1`,
        [w.id],
      ),
      this.db.query(
        `SELECT e.id, e.job_posting_id, jp.case_number,
          p.first_name AS patient_first_name, p.last_name AS patient_last_name,
          e.resultado, e.interview_date, e.interview_time,
          e.recruiter_name, e.coordinator_name,
          e.rejection_reason, e.rejection_reason_category, e.attended, e.created_at
        FROM encuadres e
        LEFT JOIN job_postings jp ON e.job_posting_id = jp.id
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE e.worker_id = $1 ORDER BY e.created_at DESC`,
        [w.id],
      ),
    ]);

    let parsedLanguages: string[] = [];
    if (languages) {
      try { parsedLanguages = JSON.parse(languages); } catch { parsedLanguages = [languages]; }
    }

    const isMatchable = w.status === 'REGISTERED' && w.deleted_at === null;
    const isActive = w.status !== 'DISABLED' && w.deleted_at === null;
    const doc = docsResult.rows[0] ?? null;
    const loc = locationResult.rows[0] ?? null;

    return {
      id: w.id, email: w.email, phone: w.phone ?? null, whatsappPhone: whatsappPhone ?? null,
      country: w.country, timezone: w.timezone, status: w.status,
      dataSources: w.data_sources ?? [], platform: mapPlatformLabel(w.data_sources ?? []),
      createdAt: w.created_at, updatedAt: w.updated_at,
      firstName: firstName ?? null, lastName: lastName ?? null, sex: sex ?? null,
      gender: gender ?? null, birthDate: birthDate ?? null,
      documentType: w.document_type ?? null, documentNumber: documentNumber ?? null,
      profilePhotoUrl: profilePhotoUrl ?? null, profession: w.profession ?? null,
      occupation: w.occupation ?? null, knowledgeLevel: w.knowledge_level ?? null,
      titleCertificate: w.title_certificate ?? null,
      experienceTypes: w.experience_types ?? [], yearsExperience: w.years_experience ?? null,
      preferredTypes: w.preferred_types ?? [], preferredAgeRange: w.preferred_age_range ?? [],
      languages: parsedLanguages, sexualOrientation: sexualOrientation ?? null,
      race: race ?? null, religion: religion ?? null,
      weightKg: weightKg ?? null, heightCm: heightCm ?? null,
      hobbies: w.hobbies ?? [], diagnosticPreferences: w.diagnostic_preferences ?? [],
      linkedinUrl: linkedinUrl ?? null, isMatchable, isActive,
      documents: doc ? {
        id: doc.id, resumeCvUrl: doc.resume_cv_url ?? null,
        identityDocumentUrl: doc.identity_document_url ?? null,
        criminalRecordUrl: doc.criminal_record_url ?? null,
        professionalRegistrationUrl: doc.professional_registration_url ?? null,
        liabilityInsuranceUrl: doc.liability_insurance_url ?? null,
        additionalCertificatesUrls: doc.additional_certificates_urls ?? [],
        documentsStatus: doc.documents_status ?? 'pending',
        reviewNotes: doc.review_notes ?? null, reviewedBy: doc.reviewed_by ?? null,
        reviewedAt: doc.reviewed_at ?? null, submittedAt: doc.submitted_at ?? null,
      } : null,
      serviceAreas: serviceAreasResult.rows.map((sa: any) => ({
        id: sa.id, address: sa.address_line ?? null, serviceRadiusKm: sa.radius_km ?? null,
        lat: sa.latitude ? parseFloat(sa.latitude) : null,
        lng: sa.longitude ? parseFloat(sa.longitude) : null,
      })),
      location: loc ? {
        address: loc.address ?? null, city: loc.city ?? null,
        workZone: loc.work_zone ?? null, interestZone: loc.interest_zone ?? null,
      } : null,
      encuadres: encuadresResult.rows.map((e: any) => ({
        id: e.id, jobPostingId: e.job_posting_id ?? null, caseNumber: e.case_number ?? null,
        patientName: [e.patient_first_name, e.patient_last_name].filter(Boolean).join(' ') || null,
        resultado: e.resultado ?? null, interviewDate: e.interview_date ?? null,
        interviewTime: e.interview_time ?? null, recruiterName: e.recruiter_name ?? null,
        coordinatorName: e.coordinator_name ?? null, rejectionReason: e.rejection_reason ?? null,
        rejectionReasonCategory: e.rejection_reason_category ?? null,
        attended: e.attended ?? null, createdAt: e.created_at,
      })),
    };
  }

  /**
   * GET /api/admin/workers/:id
   * Retorna detalhes completos de um worker por ID.
   */
  async getWorkerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const workerResult = await this.db.query(
        `SELECT ${WORKER_DETAIL_COLS} FROM workers w WHERE w.id = $1 AND w.merged_into_id IS NULL`,
        [id],
      );
      if (workerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }
      const data = await this.buildWorkerDetailResponse(workerResult.rows[0]);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerById error:', error);
      res.status(500).json({ success: false, error: 'Failed to get worker details', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/by-phone?phone=...
   * Busca worker pelo número de telefone. Retorna os mesmos dados completos de getWorkerById.
   */
  async getWorkerByPhone(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.query as Record<string, string>;
      if (!phone || phone.trim() === '') {
        res.status(400).json({ success: false, error: 'Query parameter "phone" is required' });
        return;
      }
      const candidates = generatePhoneCandidates(phone);
      if (candidates.length === 0) {
        res.status(400).json({ success: false, error: 'Query parameter "phone" is required' });
        return;
      }
      const workerResult = await this.db.query(
        `SELECT ${WORKER_DETAIL_COLS} FROM workers w WHERE w.phone = ANY($1::text[]) AND w.merged_into_id IS NULL`,
        [candidates],
      );
      if (workerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }
      const data = await this.buildWorkerDetailResponse(workerResult.rows[0]);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerByPhone error:', error);
      res.status(500).json({ success: false, error: 'Failed to get worker details', details: error.message });
    }
  }

  /**
   * GET /api/admin/workers/stats
   * Retorna contagem de workers cadastrados hoje, ontem e exatamente 7 dias atrás.
   */
  async getWorkerDateStats(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.db.query<{ today: string; yesterday: string; seven_days_ago: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)::int       AS today,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1)::int   AS yesterday,
          COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 7)::int   AS seven_days_ago
        FROM workers WHERE merged_into_id IS NULL
      `);
      const row = result.rows[0];
      const stats: WorkerDateStats = {
        today: parseInt(row.today, 10),
        yesterday: parseInt(row.yesterday, 10),
        sevenDaysAgo: parseInt(row.seven_days_ago, 10),
      };
      res.status(200).json({ success: true, data: stats });
    } catch (error: any) {
      console.error('[AdminWorkersController] getWorkerDateStats error:', error);
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas de workers', details: error.message });
    }
  }
}
