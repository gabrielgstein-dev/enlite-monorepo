import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { KMSEncryptionService } from '../security/KMSEncryptionService';
import {
  Encuadre,
  CreateEncuadreDTO,
  UpdateEncuadreLLMDTO,
  EncuadreFilters,
  SupplementEncuadreDTO,
  RejectionReasonCategory,
} from '../../domain/entities/Encuadre';

export class EncuadreRepository {
  private pool: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  async upsert(dto: CreateEncuadreDTO): Promise<{ encuadre: Encuadre; created: boolean }> {
    // ON CONFLICT: atualiza campos operacionais que podem mudar entre re-importações.
    // Regras:
    //   resultado / attended / accepts_case / rejection_reason → sempre sobrescreve
    //     (a planilha atualizada é a fonte de verdade para esses estados)
    //   obs_* → sempre sobrescreve (coordenadoras editam observações)
    //   meet_link / origen / id_onboarding / worker_email_encrypted → COALESCE (preenche se vazio)
    //   llm_processed_at → anulado se obs mudou (força re-processamento)
    //   campos LLM restantes → apagados junto com llm_processed_at (serão reprocessados)
    const workerEmailEnc = await this.encryptionService.encrypt(dto.workerEmail ?? null);

    const query = `
      INSERT INTO encuadres (
        worker_id, job_posting_id,
        worker_raw_name, worker_raw_phone, occupation_raw,
        recruiter_name, coordinator_name, recruitment_date,
        interview_date, interview_time, meet_link,
        attended, absence_reason,
        accepts_case, rejection_reason, rejection_reason_category, resultado, redireccionamiento,
        has_cv, has_dni, has_cert_at, has_afip, has_cbu, has_ap, has_seguros,
        worker_email_encrypted,
        obs_reclutamiento, obs_encuadre, obs_adicionales,
        origen, id_onboarding,
        dedup_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      )
      ON CONFLICT (dedup_hash) DO UPDATE SET
        resultado          = EXCLUDED.resultado,
        attended           = EXCLUDED.attended,
        accepts_case       = EXCLUDED.accepts_case,
        rejection_reason   = EXCLUDED.rejection_reason,
        rejection_reason_category = EXCLUDED.rejection_reason_category,
        redireccionamiento = EXCLUDED.redireccionamiento,
        absence_reason     = EXCLUDED.absence_reason,
        has_cv             = EXCLUDED.has_cv,
        has_dni            = EXCLUDED.has_dni,
        has_cert_at        = EXCLUDED.has_cert_at,
        has_afip           = EXCLUDED.has_afip,
        has_cbu            = EXCLUDED.has_cbu,
        has_ap             = EXCLUDED.has_ap,
        has_seguros        = EXCLUDED.has_seguros,
        obs_reclutamiento  = EXCLUDED.obs_reclutamiento,
        obs_encuadre       = EXCLUDED.obs_encuadre,
        obs_adicionales    = EXCLUDED.obs_adicionales,
        meet_link          = COALESCE(encuadres.meet_link,      EXCLUDED.meet_link),
        origen             = COALESCE(encuadres.origen,         EXCLUDED.origen),
        id_onboarding      = COALESCE(encuadres.id_onboarding,  EXCLUDED.id_onboarding),
        worker_email_encrypted = COALESCE(encuadres.worker_email_encrypted, EXCLUDED.worker_email_encrypted),
        -- Reseta LLM apenas quando obs mudou — força re-processamento com o texto novo
        llm_processed_at          = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL
          ELSE encuadres.llm_processed_at
        END,
        llm_interest_level        = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_interest_level
        END,
        llm_extracted_experience  = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_extracted_experience
        END,
        llm_availability_notes    = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_availability_notes
        END,
        llm_real_rejection_reason = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_real_rejection_reason
        END,
        llm_follow_up_potential   = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_follow_up_potential
        END,
        llm_raw_response          = CASE
          WHEN encuadres.obs_encuadre       IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento  IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_raw_response
        END,
        updated_at = NOW()
      RETURNING *, (xmax = 0) AS inserted
    `;

    const values = [
      dto.workerId ?? null,
      dto.jobPostingId ?? null,
      dto.workerRawName ?? null,
      dto.workerRawPhone ?? null,
      dto.occupationRaw ?? null,
      dto.recruiterName ?? null,
      dto.coordinatorName ?? null,
      dto.recruitmentDate ?? null,
      dto.interviewDate ?? null,
      dto.interviewTime ?? null,
      dto.meetLink ?? null,
      dto.attended ?? null,
      dto.absenceReason ?? null,
      dto.acceptsCase ?? null,
      dto.rejectionReason ?? null,
      dto.rejectionReasonCategory ?? null,
      dto.resultado ?? null,
      dto.redireccionamiento ?? null,
      dto.hasCv ?? null,
      dto.hasDni ?? null,
      dto.hasCertAt ?? null,
      dto.hasAfip ?? null,
      dto.hasCbu ?? null,
      dto.hasAp ?? null,
      dto.hasSeguros ?? null,
      workerEmailEnc,
      dto.obsReclutamiento ?? null,
      dto.obsEncuadre ?? null,
      dto.obsAdicionales ?? null,
      dto.origen ?? null,
      dto.idOnboarding ?? null,
      dto.dedupHash,
    ];

    const result = await this.pool.query(query, values);
    const created = result.rows[0]?.inserted ?? false;
    return { encuadre: await this.mapRow(result.rows[0]), created };
  }

  /**
   * Insere/atualiza múltiplos encuadres em uma única query via UNNEST.
   * Usa as mesmas regras de ON CONFLICT que upsert() singular.
   */
  async bulkUpsert(dtos: CreateEncuadreDTO[]): Promise<{ created: number; updated: number }> {
    if (dtos.length === 0) return { created: 0, updated: 0 };

    // Encrypt all worker emails in parallel before building the query
    const encryptedEmails = await Promise.all(
      dtos.map(d => this.encryptionService.encrypt(d.workerEmail ?? null))
    );

    const query = `
      INSERT INTO encuadres (
        worker_id, job_posting_id,
        worker_raw_name, worker_raw_phone, occupation_raw,
        recruiter_name, coordinator_name, recruitment_date,
        interview_date, interview_time, meet_link,
        attended, absence_reason,
        accepts_case, rejection_reason, rejection_reason_category, resultado, redireccionamiento,
        has_cv, has_dni, has_cert_at, has_afip, has_cbu, has_ap, has_seguros,
        worker_email_encrypted,
        obs_reclutamiento, obs_encuadre, obs_adicionales,
        origen, id_onboarding, dedup_hash
      )
      SELECT
        UNNEST($1::uuid[]),  UNNEST($2::uuid[]),
        UNNEST($3::text[]),  UNNEST($4::text[]),  UNNEST($5::text[]),
        UNNEST($6::text[]),  UNNEST($7::text[]),  UNNEST($8::date[]),
        UNNEST($9::date[]),  NULLIF(UNNEST($10::text[]), '')::time, UNNEST($11::text[]),
        UNNEST($12::boolean[]), UNNEST($13::text[]),
        UNNEST($14::text[]), UNNEST($15::text[]), UNNEST($16::text[]), UNNEST($17::text[]), UNNEST($18::text[]),
        UNNEST($19::boolean[]), UNNEST($20::boolean[]), UNNEST($21::boolean[]),
        UNNEST($22::boolean[]), UNNEST($23::boolean[]), UNNEST($24::boolean[]), UNNEST($25::boolean[]),
        UNNEST($26::text[]),
        UNNEST($27::text[]), UNNEST($28::text[]), UNNEST($29::text[]),
        UNNEST($30::text[]), UNNEST($31::text[]), UNNEST($32::text[])
      ON CONFLICT (dedup_hash) DO UPDATE SET
        resultado          = EXCLUDED.resultado,
        attended           = EXCLUDED.attended,
        accepts_case       = EXCLUDED.accepts_case,
        rejection_reason   = EXCLUDED.rejection_reason,
        rejection_reason_category = EXCLUDED.rejection_reason_category,
        redireccionamiento = EXCLUDED.redireccionamiento,
        absence_reason     = EXCLUDED.absence_reason,
        has_cv             = EXCLUDED.has_cv,
        has_dni            = EXCLUDED.has_dni,
        has_cert_at        = EXCLUDED.has_cert_at,
        has_afip           = EXCLUDED.has_afip,
        has_cbu            = EXCLUDED.has_cbu,
        has_ap             = EXCLUDED.has_ap,
        has_seguros        = EXCLUDED.has_seguros,
        obs_reclutamiento  = EXCLUDED.obs_reclutamiento,
        obs_encuadre       = EXCLUDED.obs_encuadre,
        obs_adicionales    = EXCLUDED.obs_adicionales,
        meet_link          = COALESCE(encuadres.meet_link,     EXCLUDED.meet_link),
        origen             = COALESCE(encuadres.origen,        EXCLUDED.origen),
        id_onboarding      = COALESCE(encuadres.id_onboarding, EXCLUDED.id_onboarding),
        worker_email_encrypted = COALESCE(encuadres.worker_email_encrypted, EXCLUDED.worker_email_encrypted),
        llm_processed_at          = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_processed_at END,
        llm_interest_level        = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_interest_level END,
        llm_extracted_experience  = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_extracted_experience END,
        llm_availability_notes    = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_availability_notes END,
        llm_real_rejection_reason = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_real_rejection_reason END,
        llm_follow_up_potential   = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_follow_up_potential END,
        llm_raw_response          = CASE
          WHEN encuadres.obs_encuadre      IS DISTINCT FROM EXCLUDED.obs_encuadre
            OR encuadres.obs_reclutamiento IS DISTINCT FROM EXCLUDED.obs_reclutamiento
          THEN NULL ELSE encuadres.llm_raw_response END,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `;

    const result = await this.pool.query(query, [
      dtos.map(d => d.workerId ?? null),
      dtos.map(d => d.jobPostingId ?? null),
      dtos.map(d => d.workerRawName ?? null),
      dtos.map(d => d.workerRawPhone ?? null),
      dtos.map(d => d.occupationRaw ?? null),
      dtos.map(d => d.recruiterName ?? null),
      dtos.map(d => d.coordinatorName ?? null),
      dtos.map(d => d.recruitmentDate ?? null),
      dtos.map(d => d.interviewDate ?? null),
      dtos.map(d => d.interviewTime ?? null),
      dtos.map(d => d.meetLink ?? null),
      dtos.map(d => d.attended ?? null),
      dtos.map(d => d.absenceReason ?? null),
      dtos.map(d => d.acceptsCase ?? null),
      dtos.map(d => d.rejectionReason ?? null),
      dtos.map(d => d.rejectionReasonCategory ?? null),
      dtos.map(d => d.resultado ?? null),
      dtos.map(d => d.redireccionamiento ?? null),
      dtos.map(d => d.hasCv ?? null),
      dtos.map(d => d.hasDni ?? null),
      dtos.map(d => d.hasCertAt ?? null),
      dtos.map(d => d.hasAfip ?? null),
      dtos.map(d => d.hasCbu ?? null),
      dtos.map(d => d.hasAp ?? null),
      dtos.map(d => d.hasSeguros ?? null),
      encryptedEmails,
      dtos.map(d => d.obsReclutamiento ?? null),
      dtos.map(d => d.obsEncuadre ?? null),
      dtos.map(d => d.obsAdicionales ?? null),
      dtos.map(d => d.origen ?? null),
      dtos.map(d => d.idOnboarding ?? null),
      dtos.map(d => d.dedupHash),
    ]);

    const created = result.rows.filter(r => r.inserted).length;
    return { created, updated: result.rows.length - created };
  }

  /**
   * Sincroniza encuadres com worker_job_applications.
   * Roda um upsert baseado no resultado/status do encuadre para manter
   * o pipeline consistente. Idempotente — pode ser chamado após cada import.
   */
  async syncToWorkerJobApplications(): Promise<number> {
    const result = await this.pool.query(`
      INSERT INTO worker_job_applications (
        worker_id, job_posting_id,
        application_status, application_funnel_stage,
        applied_at, rejection_reason, source
      )
      SELECT
        e.worker_id,
        e.job_posting_id,
        CASE
          WHEN e.resultado IN ('SELECCIONADO', 'REEMPLAZO') THEN 'approved'
          WHEN e.resultado IN ('RECHAZADO', 'AT_NO_ACEPTA', 'BLACKLIST') THEN 'rejected'
          WHEN e.resultado = 'REPROGRAMAR' THEN 'interview_scheduled'
          WHEN e.resultado IS NOT NULL OR e.attended = true THEN 'under_review'
          ELSE 'applied'
        END,
        CASE
          WHEN e.resultado IN ('SELECCIONADO', 'REEMPLAZO') THEN 'QUALIFIED'
          WHEN e.resultado IN ('RECHAZADO', 'AT_NO_ACEPTA', 'BLACKLIST') THEN 'NOT_QUALIFIED'
          WHEN e.attended = true THEN 'IN_PROGRESS'
          WHEN e.interview_date IS NOT NULL OR e.resultado = 'REPROGRAMAR' THEN 'IN_PROGRESS'
          ELSE 'INITIATED'
        END,
        COALESCE(e.recruitment_date::timestamptz, e.created_at),
        e.rejection_reason,
        'planilla_operativa'
      FROM (
        SELECT DISTINCT ON (worker_id, job_posting_id)
          worker_id, job_posting_id, resultado, attended,
          interview_date, recruitment_date, created_at, rejection_reason
        FROM encuadres
        WHERE worker_id IS NOT NULL AND job_posting_id IS NOT NULL
        ORDER BY worker_id, job_posting_id,
          CASE resultado
            WHEN 'SELECCIONADO' THEN 1 WHEN 'REEMPLAZO' THEN 2
            WHEN 'RECHAZADO' THEN 3 WHEN 'AT_NO_ACEPTA' THEN 4 WHEN 'BLACKLIST' THEN 5
            WHEN 'REPROGRAMAR' THEN 6 ELSE 7
          END,
          COALESCE(recruitment_date, created_at::date) DESC NULLS LAST
      ) e
      ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET
        application_status       = CASE
          WHEN worker_job_applications.source = 'talentum' THEN worker_job_applications.application_status
          ELSE EXCLUDED.application_status
        END,
        application_funnel_stage = CASE
          WHEN worker_job_applications.source = 'talentum' THEN worker_job_applications.application_funnel_stage
          ELSE EXCLUDED.application_funnel_stage
        END,
        rejection_reason         = COALESCE(EXCLUDED.rejection_reason, worker_job_applications.rejection_reason),
        updated_at               = NOW()
    `);
    return result.rowCount ?? 0;
  }

  /**
   * Busca encuadre por chave suave (job_posting_id + phone + interview_date).
   * Usado para cruzar _Base1 com abas individuais por caso.
   */
  async findSoftMatch(
    jobPostingId: string,
    phone: string,
    interviewDate: Date | null,
    recruitmentDate: Date | null,
  ): Promise<Encuadre | null> {
    const conditions: string[] = ['job_posting_id = $1', 'worker_raw_phone = $2'];
    const values: unknown[] = [jobPostingId, phone];
    let idx = 3;

    if (interviewDate) {
      conditions.push(`interview_date = $${idx++}`);
      values.push(interviewDate.toISOString().split('T')[0]);
    }
    if (recruitmentDate) {
      conditions.push(`recruitment_date = $${idx++}`);
      values.push(recruitmentDate.toISOString().split('T')[0]);
    }

    const result = await this.pool.query(
      `SELECT * FROM encuadres WHERE ${conditions.join(' AND ')} LIMIT 1`,
      values,
    );
    return result.rows[0] ? await this.mapRow(result.rows[0]) : null;
  }

  /**
   * Complementa campos nulos de um encuadre existente com dados das abas individuais.
   * Usa COALESCE para nunca sobrescrever um campo já preenchido com null.
   */
  async updateSupplement(id: string, dto: SupplementEncuadreDTO): Promise<void> {
    const workerEmailEnc = await this.encryptionService.encrypt(dto.workerEmail ?? null);

    await this.pool.query(
      `UPDATE encuadres SET
        interview_time    = COALESCE(interview_time,    $2),
        meet_link         = COALESCE(meet_link,         $3),
        origen            = COALESCE(origen,            $4),
        id_onboarding     = COALESCE(id_onboarding,     $5),
        resultado         = COALESCE(resultado,         $6),
        has_cv            = COALESCE(has_cv,            $7),
        has_dni           = COALESCE(has_dni,           $8),
        has_cert_at       = COALESCE(has_cert_at,       $9),
        has_afip          = COALESCE(has_afip,          $10),
        has_cbu           = COALESCE(has_cbu,           $11),
        has_ap            = COALESCE(has_ap,            $12),
        has_seguros       = COALESCE(has_seguros,       $13),
        worker_email_encrypted = COALESCE(worker_email_encrypted, $14),
        obs_encuadre      = COALESCE(obs_encuadre,      $15),
        obs_adicionales   = COALESCE(obs_adicionales,   $16),
        absence_reason    = COALESCE(absence_reason,    $17),
        rejection_reason  = COALESCE(rejection_reason,  $18),
        rejection_reason_category = COALESCE(rejection_reason_category, $19),
        redireccionamiento= COALESCE(redireccionamiento,$20),
        updated_at        = NOW()
       WHERE id = $1`,
      [
        id,
        dto.interviewTime ?? null,
        dto.meetLink ?? null,
        dto.origen ?? null,
        dto.idOnboarding ?? null,
        dto.resultado ?? null,
        dto.hasCv ?? null,
        dto.hasDni ?? null,
        dto.hasCertAt ?? null,
        dto.hasAfip ?? null,
        dto.hasCbu ?? null,
        dto.hasAp ?? null,
        dto.hasSeguros ?? null,
        workerEmailEnc,
        dto.obsEncuadre ?? null,
        dto.obsAdicionales ?? null,
        dto.absenceReason ?? null,
        dto.rejectionReason ?? null,
        dto.rejectionReasonCategory ?? null,
        dto.redireccionamiento ?? null,
      ],
    );
  }

  async findByDedupHash(hash: string): Promise<Encuadre | null> {
    const result = await this.pool.query(
      'SELECT * FROM encuadres WHERE dedup_hash = $1',
      [hash]
    );
    return result.rows[0] ? await this.mapRow(result.rows[0]) : null;
  }

  async findByWorkerId(workerId: string): Promise<Encuadre[]> {
    const result = await this.pool.query(
      `SELECT e.*, jp.case_number, jp.patient_name
       FROM encuadres e
       LEFT JOIN job_postings jp ON jp.id = e.job_posting_id AND jp.deleted_at IS NULL
       WHERE e.worker_id = $1
       ORDER BY e.interview_date DESC NULLS LAST, e.created_at DESC`,
      [workerId]
    );
    return Promise.all(result.rows.map(r => this.mapRow(r)));
  }

  async findByJobPostingId(jobPostingId: string): Promise<Encuadre[]> {
    const result = await this.pool.query(
      `SELECT e.*, w.phone as worker_phone
       FROM encuadres e
       LEFT JOIN workers w ON w.id = e.worker_id
       WHERE e.job_posting_id = $1
       ORDER BY e.interview_date DESC NULLS LAST, e.created_at DESC`,
      [jobPostingId]
    );
    return Promise.all(result.rows.map(r => this.mapRow(r)));
  }

  async findPendingLLMEnrichment(limit = 50): Promise<Encuadre[]> {
    const result = await this.pool.query(
      `SELECT * FROM encuadres
       WHERE llm_processed_at IS NULL
         AND (obs_reclutamiento IS NOT NULL OR obs_encuadre IS NOT NULL)
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return Promise.all(result.rows.map(r => this.mapRow(r)));
  }

  async updateLLMFields(dto: UpdateEncuadreLLMDTO): Promise<void> {
    await this.pool.query(
      `UPDATE encuadres SET
        llm_processed_at = NOW(),
        llm_interest_level = $2,
        llm_extracted_experience = $3,
        llm_availability_notes = $4,
        llm_real_rejection_reason = $5,
        llm_follow_up_potential = $6,
        llm_raw_response = $7
       WHERE id = $1`,
      [
        dto.id,
        dto.llmInterestLevel,
        JSON.stringify(dto.llmExtractedExperience),
        dto.llmAvailabilityNotes,
        dto.llmRealRejectionReason,
        dto.llmFollowUpPotential,
        JSON.stringify(dto.llmRawResponse),
      ]
    );
  }

  async linkWorkersByPhone(): Promise<number> {
    const result = await this.pool.query(`
      UPDATE encuadres e
      SET worker_id = w.id
      FROM workers w
      WHERE e.worker_id IS NULL
        AND e.worker_raw_phone IS NOT NULL
        AND w.phone = e.worker_raw_phone
    `);
    return result.rowCount ?? 0;
  }

  async countByFilters(filters: EncuadreFilters): Promise<number> {
    const { where, values } = this.buildWhereClause(filters);
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM encuadres ${where}`,
      values
    );
    return parseInt(result.rows[0].count);
  }

  /** Conta encuadres com attended=true, com filtros opcionais */
  async countAttended(filters: { startDate?: string; endDate?: string; country?: string } = {}): Promise<number> {
    const conditions: string[] = ['e.attended = true'];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.startDate) { conditions.push(`e.interview_date >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`e.interview_date <= $${idx++}`); values.push(filters.endDate); }
    if (filters.country) {
      conditions.push(`jp.country = $${idx++}`);
      values.push(filters.country);
    }

    const joinClause = filters.country
      ? 'LEFT JOIN job_postings jp ON e.job_posting_id = jp.id AND jp.deleted_at IS NULL'
      : '';

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM encuadres e ${joinClause} WHERE ${conditions.join(' AND ')}`,
      values
    );
    return (result.rows[0]?.count as number) ?? 0;
  }

  /** Conta candidatos únicos para um job_posting (excluindo RECHAZADO e BLACKLIST) */
  async countCandidatesByJobPosting(jobPostingId: string, filters: { startDate?: string; endDate?: string } = {}): Promise<number> {
    const conditions: string[] = [
      'job_posting_id = $1',
      "resultado NOT IN ('RECHAZADO', 'BLACKLIST') OR resultado IS NULL",
    ];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`interview_date >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`interview_date <= $${idx++}`); values.push(filters.endDate); }

    const result = await this.pool.query(
      `SELECT COUNT(DISTINCT COALESCE(worker_id::text, worker_raw_phone))::int AS count FROM encuadres WHERE ${conditions.join(' AND ')}`,
      values
    );
    return (result.rows[0]?.count as number) ?? 0;
  }

  /** Conta invitados (agendados) e asistentes para um job_posting */
  async countInvitedAndAttended(jobPostingId: string, filters: { startDate?: string; endDate?: string } = {}): Promise<{ invitados: number; asistentes: number }> {
    const conditions: string[] = ['job_posting_id = $1'];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`interview_date >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`interview_date <= $${idx++}`); values.push(filters.endDate); }

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS invitados, COUNT(*) FILTER (WHERE attended = true)::int AS asistentes
       FROM encuadres WHERE ${conditions.join(' AND ')}`,
      values
    );
    return {
      invitados:  (result.rows[0]?.invitados as number)  ?? 0,
      asistentes: (result.rows[0]?.asistentes as number) ?? 0,
    };
  }

  /** Conta encuadres agrupados por resultado para um job_posting */
  async countByResultado(jobPostingId: string, filters: { startDate?: string; endDate?: string } = {}): Promise<Array<{ resultado: string; count: number }>> {
    const conditions: string[] = ['job_posting_id = $1', 'resultado IS NOT NULL'];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`interview_date >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`interview_date <= $${idx++}`); values.push(filters.endDate); }

    const result = await this.pool.query(
      `SELECT resultado, COUNT(*)::int AS count FROM encuadres WHERE ${conditions.join(' AND ')} GROUP BY resultado ORDER BY count DESC`,
      values
    );
    return result.rows.map(r => ({ resultado: r.resultado as string, count: r.count as number }));
  }

  /** Conta SELECCIONADO e REEMPLAZO por número de caso */
  async countSelAndRemByCaseNumber(country: string = 'AR'): Promise<Record<string, { sel: number; rem: number }>> {
    const result = await this.pool.query(
      `SELECT jp.case_number,
              COUNT(*) FILTER (WHERE e.resultado = 'SELECCIONADO')::int AS sel,
              COUNT(*) FILTER (WHERE e.resultado IN ('REEMPLAZO'))::int AS rem
       FROM encuadres e
       JOIN job_postings jp ON e.job_posting_id = jp.id
       WHERE jp.country = $1
         AND jp.deleted_at IS NULL
         AND e.resultado IN ('SELECCIONADO', 'REEMPLAZO')
       GROUP BY jp.case_number`,
      [country]
    );
    const map: Record<string, { sel: number; rem: number }> = {};
    for (const r of result.rows) {
      map[String(r.case_number)] = { sel: r.sel as number, rem: r.rem as number };
    }
    return map;
  }

  private buildWhereClause(filters: EncuadreFilters): { where: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.workerId) { conditions.push(`worker_id = $${idx++}`); values.push(filters.workerId); }
    if (filters.jobPostingId) { conditions.push(`job_posting_id = $${idx++}`); values.push(filters.jobPostingId); }
    if (filters.resultado) { conditions.push(`resultado = $${idx++}`); values.push(filters.resultado); }
    if (filters.llmPendingOnly) {
      conditions.push(`llm_processed_at IS NULL AND (obs_reclutamiento IS NOT NULL OR obs_encuadre IS NOT NULL)`);
    }

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      values,
    };
  }

  /**
   * Aggregates structured rejection counts per category for a worker.
   * Used by MatchmakingService to penalize candidates with rejection history.
   */
  async getWorkerRejectionHistory(workerId: string): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT rejection_reason_category, COUNT(*)::integer AS count
       FROM encuadres
       WHERE worker_id = $1
         AND rejection_reason_category IS NOT NULL
       GROUP BY rejection_reason_category`,
      [workerId]
    );
    const history: Record<string, number> = {};
    for (const row of result.rows) {
      history[row.rejection_reason_category] = row.count;
    }
    return history;
  }

  private async mapRow(row: Record<string, unknown>): Promise<Encuadre> {
    const workerEmail = await this.encryptionService.decrypt(
      row.worker_email_encrypted as string | null
    );

    return {
      id: row.id as string,
      workerId: row.worker_id as string | null,
      jobPostingId: row.job_posting_id as string | null,
      workerRawName: row.worker_raw_name as string | null,
      workerRawPhone: row.worker_raw_phone as string | null,
      occupationRaw: row.occupation_raw as string | null,
      recruiterName: row.recruiter_name as string | null,
      coordinatorName: row.coordinator_name as string | null,
      recruitmentDate: row.recruitment_date ? new Date(row.recruitment_date as string) : null,
      interviewDate: row.interview_date ? new Date(row.interview_date as string) : null,
      interviewTime: row.interview_time as string | null,
      meetLink: row.meet_link as string | null,
      attended: row.attended as boolean | null,
      absenceReason: row.absence_reason as string | null,
      acceptsCase: row.accepts_case as 'Si' | 'No' | 'A confirmar' | null,
      rejectionReason: row.rejection_reason as string | null,
      rejectionReasonCategory: row.rejection_reason_category as Encuadre['rejectionReasonCategory'],
      resultado: row.resultado as Encuadre['resultado'],
      redireccionamiento: row.redireccionamiento as string | null,
      hasCv: row.has_cv as boolean | null,
      hasDni: row.has_dni as boolean | null,
      hasCertAt: row.has_cert_at as boolean | null,
      hasAfip: row.has_afip as boolean | null,
      hasCbu: row.has_cbu as boolean | null,
      hasAp: row.has_ap as boolean | null,
      hasSeguros: row.has_seguros as boolean | null,
      workerEmail: workerEmail || null,
      obsReclutamiento: row.obs_reclutamiento as string | null,
      obsEncuadre: row.obs_encuadre as string | null,
      obsAdicionales: row.obs_adicionales as string | null,
      origen: row.origen as string | null,
      idOnboarding: row.id_onboarding as string | null,
      llmProcessedAt: row.llm_processed_at ? new Date(row.llm_processed_at as string) : null,
      llmInterestLevel: row.llm_interest_level as Encuadre['llmInterestLevel'],
      llmExtractedExperience: row.llm_extracted_experience as Encuadre['llmExtractedExperience'],
      llmAvailabilityNotes: row.llm_availability_notes as string | null,
      llmRealRejectionReason: row.llm_real_rejection_reason as string | null,
      llmFollowUpPotential: row.llm_follow_up_potential as boolean | null,
      dedupHash: row.dedup_hash as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
