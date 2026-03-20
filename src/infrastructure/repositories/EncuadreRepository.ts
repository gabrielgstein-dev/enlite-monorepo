import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  Encuadre,
  CreateEncuadreDTO,
  UpdateEncuadreLLMDTO,
  EncuadreFilters,
  SupplementEncuadreDTO,
} from '../../domain/entities/Encuadre';

export class EncuadreRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async upsert(dto: CreateEncuadreDTO): Promise<{ encuadre: Encuadre; created: boolean }> {
    const query = `
      INSERT INTO encuadres (
        worker_id, job_posting_id,
        worker_raw_name, worker_raw_phone, occupation_raw,
        recruiter_name, coordinator_name, recruitment_date,
        interview_date, interview_time, meet_link,
        attended, absence_reason,
        accepts_case, rejection_reason, resultado, redireccionamiento,
        has_cv, has_dni, has_cert_at, has_afip, has_cbu, has_ap, has_seguros,
        worker_email,
        obs_reclutamiento, obs_encuadre, obs_adicionales,
        origen, id_onboarding,
        dedup_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
      )
      ON CONFLICT (dedup_hash) DO NOTHING
      RETURNING *
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
      dto.resultado ?? null,
      dto.redireccionamiento ?? null,
      dto.hasCv ?? null,
      dto.hasDni ?? null,
      dto.hasCertAt ?? null,
      dto.hasAfip ?? null,
      dto.hasCbu ?? null,
      dto.hasAp ?? null,
      dto.hasSeguros ?? null,
      dto.workerEmail ?? null,
      dto.obsReclutamiento ?? null,
      dto.obsEncuadre ?? null,
      dto.obsAdicionales ?? null,
      dto.origen ?? null,
      dto.idOnboarding ?? null,
      dto.dedupHash,
    ];

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      const existing = await this.findByDedupHash(dto.dedupHash);
      return { encuadre: existing!, created: false };
    }

    return { encuadre: this.mapRow(result.rows[0]), created: true };
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
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Complementa campos nulos de um encuadre existente com dados das abas individuais.
   * Usa COALESCE para nunca sobrescrever um campo já preenchido com null.
   */
  async updateSupplement(id: string, dto: SupplementEncuadreDTO): Promise<void> {
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
        worker_email      = COALESCE(worker_email,      $14),
        obs_encuadre      = COALESCE(obs_encuadre,      $15),
        obs_adicionales   = COALESCE(obs_adicionales,   $16),
        absence_reason    = COALESCE(absence_reason,    $17),
        rejection_reason  = COALESCE(rejection_reason,  $18),
        redireccionamiento= COALESCE(redireccionamiento,$19),
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
        dto.workerEmail ?? null,
        dto.obsEncuadre ?? null,
        dto.obsAdicionales ?? null,
        dto.absenceReason ?? null,
        dto.rejectionReason ?? null,
        dto.redireccionamiento ?? null,
      ],
    );
  }

  async findByDedupHash(hash: string): Promise<Encuadre | null> {
    const result = await this.pool.query(
      'SELECT * FROM encuadres WHERE dedup_hash = $1',
      [hash]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByWorkerId(workerId: string): Promise<Encuadre[]> {
    const result = await this.pool.query(
      `SELECT e.*, jp.case_number, jp.patient_name
       FROM encuadres e
       LEFT JOIN job_postings jp ON jp.id = e.job_posting_id
       WHERE e.worker_id = $1
       ORDER BY e.interview_date DESC NULLS LAST, e.created_at DESC`,
      [workerId]
    );
    return result.rows.map(this.mapRow);
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
    return result.rows.map(this.mapRow);
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
    return result.rows.map(this.mapRow);
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

  private mapRow(row: Record<string, unknown>): Encuadre {
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
      resultado: row.resultado as Encuadre['resultado'],
      redireccionamiento: row.redireccionamiento as string | null,
      hasCv: row.has_cv as boolean | null,
      hasDni: row.has_dni as boolean | null,
      hasCertAt: row.has_cert_at as boolean | null,
      hasAfip: row.has_afip as boolean | null,
      hasCbu: row.has_cbu as boolean | null,
      hasAp: row.has_ap as boolean | null,
      hasSeguros: row.has_seguros as boolean | null,
      workerEmail: row.worker_email as string | null,
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
