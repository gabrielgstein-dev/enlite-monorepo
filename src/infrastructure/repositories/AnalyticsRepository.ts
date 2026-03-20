/**
 * AnalyticsRepository
 *
 * Consultas de BI sobre workers e vagas. Usa as views criadas na migration 020:
 *   • v_job_posting_stats            — estatísticas por vaga
 *   • v_worker_registration_overview — visão completa do worker
 *   • v_potential_duplicate_workers  — candidatos a deduplicação
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

// ─── Tipos de retorno ──────────────────────────────────────────────────────

export interface WorkerCountStats {
  total: number;
  byFunnelStage: Record<string, number>;
  registrationCompleted: number;
  registrationPending: number;
  missingDocuments: number;
}

export interface JobPostingStats {
  jobPostingId: string;
  caseNumber: number;
  patientName: string | null;
  caseStatus: string;
  priority: string | null;
  dependency: string | null;
  coordinatorName: string | null;
  isCovered: boolean;
  totalInterested: number;
  totalPreScreened: number;
  totalInterviewed: number;
  totalApproved: number;
  totalRejected: number;
  totalNoAcepta: number;
  totalPending: number;
  totalIncompleteRegistration: number;
}

export interface WorkerRegistrationStatus {
  workerId: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  funnelStage: string;
  registrationCompleted: boolean;
  currentStep: number;
  documentsStatus: string;
  /** Todas as outras vagas desse worker (exceto a consultada) */
  otherVacancies: Array<{
    jobPostingId: string;
    caseNumber: number | null;
    patientName: string | null;
    resultado: string | null;
    registrationCompleted: boolean;
  }>;
}

export interface WorkerMissingDocs {
  workerId: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  funnelStage: string;
  documentsStatus: string;
  totalVacanciesInterviewed: number;
  totalVacanciesApproved: number;
}

export interface WorkerVacancyEngagement {
  workerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  registrationCompleted: boolean;
  vacancies: Array<{
    jobPostingId: string;
    caseNumber: number | null;
    patientName: string | null;
    caseStatus: string;
    resultado: string | null;
    attended: boolean | null;
    interviewDate: Date | null;
    registrationCompleted: boolean;
  }>;
}

export interface DuplicateCandidate {
  worker1Id: string;
  worker1Phone: string | null;
  worker1Email: string;
  worker1FirstName: string | null;
  worker1LastName: string | null;
  worker1Cuit: string | null;
  worker1Sources: string[];
  worker2Id: string;
  worker2Phone: string | null;
  worker2Email: string;
  worker2FirstName: string | null;
  worker2LastName: string | null;
  worker2Cuit: string | null;
  worker2Sources: string[];
  matchReason: 'cuit_match' | 'phone_similar' | 'phone_name_combined' | 'name_similar' | 'import_email_name_match';
}

// ─── Repository ────────────────────────────────────────────────────────────

export class AnalyticsRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  // ── 1. Totais de workers ──────────────────────────────────────────────────

  async countWorkers(): Promise<WorkerCountStats> {
    const [totalRes, stageRes, docsRes] = await Promise.all([
      this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE merged_into_id IS NULL)                       AS total,
          COUNT(*) FILTER (WHERE merged_into_id IS NULL AND registration_completed = TRUE)  AS completed,
          COUNT(*) FILTER (WHERE merged_into_id IS NULL AND registration_completed = FALSE) AS pending
        FROM workers
      `),
      this.pool.query(`
        SELECT funnel_stage, COUNT(*) AS cnt
        FROM workers
        WHERE merged_into_id IS NULL
        GROUP BY funnel_stage
      `),
      this.pool.query(`
        SELECT COUNT(DISTINCT w.id) AS missing
        FROM workers w
        LEFT JOIN worker_documents wd ON w.id = wd.worker_id
        WHERE w.merged_into_id IS NULL
          AND (wd.documents_status IS NULL OR wd.documents_status NOT IN ('submitted','verified'))
      `),
    ]);

    const row = totalRes.rows[0];
    const byFunnelStage: Record<string, number> = {};
    for (const r of stageRes.rows) {
      byFunnelStage[r.funnel_stage ?? 'null'] = parseInt(r.cnt);
    }

    return {
      total: parseInt(row.total),
      byFunnelStage,
      registrationCompleted: parseInt(row.completed),
      registrationPending:   parseInt(row.pending),
      missingDocuments:      parseInt(docsRes.rows[0].missing),
    };
  }

  // ── 2. Estatísticas de uma vaga ───────────────────────────────────────────

  async getJobPostingStats(jobPostingId: string): Promise<JobPostingStats | null> {
    const result = await this.pool.query(
      'SELECT * FROM v_job_posting_stats WHERE job_posting_id = $1',
      [jobPostingId],
    );
    return result.rows[0] ? this.mapJobPostingStats(result.rows[0]) : null;
  }

  async getJobPostingStatsByCaseNumber(caseNumber: number): Promise<JobPostingStats | null> {
    const result = await this.pool.query(
      'SELECT * FROM v_job_posting_stats WHERE case_number = $1',
      [caseNumber],
    );
    return result.rows[0] ? this.mapJobPostingStats(result.rows[0]) : null;
  }

  async listJobPostingStats(options: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}): Promise<JobPostingStats[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (options.status) {
      conditions.push(`case_status = $${idx++}`);
      values.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(options.limit ?? 50);
    values.push(options.offset ?? 0);

    const result = await this.pool.query(
      `SELECT * FROM v_job_posting_stats
       ${where}
       ORDER BY case_number ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values,
    );
    return result.rows.map(r => this.mapJobPostingStats(r));
  }

  // ── 3. Workers com cadastro incompleto para uma vaga ──────────────────────

  async getWorkersIncompleteForVacancy(jobPostingId: string): Promise<WorkerRegistrationStatus[]> {
    // Workers com registration_completed = FALSE vinculados a esta vaga
    const result = await this.pool.query(
      `SELECT DISTINCT
         wro.worker_id, wro.email, wro.phone,
         wro.first_name, wro.last_name, wro.funnel_stage,
         wro.registration_completed, wro.current_step, wro.documents_status
       FROM v_worker_registration_overview wro
       WHERE wro.registration_completed = FALSE
         AND wro.worker_id IN (
           SELECT worker_id FROM worker_job_applications WHERE job_posting_id = $1 AND worker_id IS NOT NULL
           UNION
           SELECT worker_id FROM encuadres            WHERE job_posting_id = $1 AND worker_id IS NOT NULL
         )
       ORDER BY wro.last_name, wro.first_name`,
      [jobPostingId],
    );

    // Para cada worker, busca suas outras vagas
    const workers = await Promise.all(result.rows.map(async r => {
      const otherVacancies = await this.getWorkerOtherVacancies(r.worker_id, jobPostingId);
      return {
        workerId: r.worker_id,
        email: r.email,
        phone: r.phone,
        firstName: r.first_name,
        lastName: r.last_name,
        funnelStage: r.funnel_stage,
        registrationCompleted: r.registration_completed,
        currentStep: parseInt(r.current_step),
        documentsStatus: r.documents_status,
        otherVacancies,
      } as WorkerRegistrationStatus;
    }));

    return workers;
  }

  // ── 4. Engajamento de um worker em vagas ──────────────────────────────────

  async getWorkerVacancyEngagement(workerId: string): Promise<WorkerVacancyEngagement | null> {
    const [workerRes, vacRes] = await Promise.all([
      this.pool.query(
        `SELECT worker_id, email, first_name, last_name, registration_completed
         FROM v_worker_registration_overview WHERE worker_id = $1`,
        [workerId],
      ),
      this.pool.query(
        `SELECT
           e.job_posting_id, jp.case_number, jp.patient_name, jp.status AS case_status,
           e.resultado, e.attended, e.interview_date,
           w.registration_completed
         FROM encuadres e
         JOIN job_postings jp ON e.job_posting_id = jp.id
         JOIN workers w ON e.worker_id = w.id
         WHERE e.worker_id = $1
         UNION
         SELECT
           wja.job_posting_id, jp.case_number, jp.patient_name, jp.status AS case_status,
           NULL AS resultado, NULL AS attended, NULL AS interview_date,
           w.registration_completed
         FROM worker_job_applications wja
         JOIN job_postings jp ON wja.job_posting_id = jp.id
         JOIN workers w ON wja.worker_id = w.id
         WHERE wja.worker_id = $1
           AND wja.job_posting_id NOT IN (
             SELECT job_posting_id FROM encuadres WHERE worker_id = $1
           )
         ORDER BY interview_date DESC NULLS LAST`,
        [workerId],
      ),
    ]);

    if (!workerRes.rows[0]) return null;
    const w = workerRes.rows[0];

    return {
      workerId: w.worker_id,
      email: w.email,
      firstName: w.first_name,
      lastName: w.last_name,
      registrationCompleted: w.registration_completed,
      vacancies: vacRes.rows.map(r => ({
        jobPostingId: r.job_posting_id,
        caseNumber: r.case_number ? parseInt(r.case_number) : null,
        patientName: r.patient_name,
        caseStatus: r.case_status,
        resultado: r.resultado,
        attended: r.attended,
        interviewDate: r.interview_date ? new Date(r.interview_date) : null,
        registrationCompleted: r.registration_completed,
      })),
    };
  }

  // ── 5. Workers sem documentos ─────────────────────────────────────────────

  async getWorkersMissingDocuments(options: {
    funnelStage?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<WorkerMissingDocs[]> {
    const conditions = [
      `documents_status NOT IN ('submitted', 'verified')`,
    ];
    const values: unknown[] = [];
    let idx = 1;

    if (options.funnelStage) {
      conditions.push(`funnel_stage = $${idx++}`);
      values.push(options.funnelStage);
    }

    values.push(options.limit ?? 50);
    values.push(options.offset ?? 0);

    const result = await this.pool.query(
      `SELECT
         worker_id, email, phone, first_name, last_name,
         funnel_stage, documents_status,
         total_vacancies_interviewed, total_vacancies_approved
       FROM v_worker_registration_overview
       WHERE ${conditions.join(' AND ')}
       ORDER BY total_vacancies_approved DESC, total_vacancies_interviewed DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values,
    );

    return result.rows.map(r => ({
      workerId: r.worker_id,
      email: r.email,
      phone: r.phone,
      firstName: r.first_name,
      lastName: r.last_name,
      funnelStage: r.funnel_stage,
      documentsStatus: r.documents_status,
      totalVacanciesInterviewed: parseInt(r.total_vacancies_interviewed),
      totalVacanciesApproved: parseInt(r.total_vacancies_approved),
    }));
  }

  // ── 6. Candidatos a deduplicação ──────────────────────────────────────────

  /**
   * Versão escalar: busca duplicatas envolvendo apenas os workers passados.
   * Usada pelo pipeline de importação para escopar a busca aos registros recém-inseridos.
   */
  async findDuplicateCandidatesForWorkers(workerIds: string[]): Promise<DuplicateCandidate[]> {
    if (workerIds.length === 0) return [];
    const result = await this.pool.query(
      `SELECT * FROM v_potential_duplicate_workers
       WHERE worker1_id = ANY($1::uuid[]) OR worker2_id = ANY($1::uuid[])
       ORDER BY match_reason, worker1_id`,
      [workerIds],
    );
    return result.rows.map(r => ({
      worker1Id:        r.worker1_id,
      worker1Phone:     r.worker1_phone,
      worker1Email:     r.worker1_email,
      worker1FirstName: r.worker1_first_name,
      worker1LastName:  r.worker1_last_name,
      worker1Cuit:      r.worker1_cuit,
      worker1Sources:   r.worker1_sources ?? [],
      worker2Id:        r.worker2_id,
      worker2Phone:     r.worker2_phone,
      worker2Email:     r.worker2_email,
      worker2FirstName: r.worker2_first_name,
      worker2LastName:  r.worker2_last_name,
      worker2Cuit:      r.worker2_cuit,
      worker2Sources:   r.worker2_sources ?? [],
      matchReason:      r.match_reason,
    })) as DuplicateCandidate[];
  }

  async findDuplicateCandidates(limit = 50): Promise<DuplicateCandidate[]> {
    const result = await this.pool.query(
      'SELECT * FROM v_potential_duplicate_workers ORDER BY match_reason, worker1_id LIMIT $1',
      [limit],
    );
    return result.rows.map(r => ({
      worker1Id:        r.worker1_id,
      worker1Phone:     r.worker1_phone,
      worker1Email:     r.worker1_email,
      worker1FirstName: r.worker1_first_name,
      worker1LastName:  r.worker1_last_name,
      worker1Cuit:      r.worker1_cuit,
      worker1Sources:   r.worker1_sources ?? [],
      worker2Id:        r.worker2_id,
      worker2Phone:     r.worker2_phone,
      worker2Email:     r.worker2_email,
      worker2FirstName: r.worker2_first_name,
      worker2LastName:  r.worker2_last_name,
      worker2Cuit:      r.worker2_cuit,
      worker2Sources:   r.worker2_sources ?? [],
      matchReason:      r.match_reason,
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getWorkerOtherVacancies(workerId: string, excludeJobPostingId: string) {
    const result = await this.pool.query(
      `SELECT e.job_posting_id, jp.case_number, jp.patient_name, e.resultado,
              w.registration_completed
       FROM encuadres e
       JOIN job_postings jp ON e.job_posting_id = jp.id
       JOIN workers     w  ON e.worker_id = w.id
       WHERE e.worker_id = $1 AND e.job_posting_id <> $2
       UNION
       SELECT wja.job_posting_id, jp.case_number, jp.patient_name, NULL AS resultado,
              w.registration_completed
       FROM worker_job_applications wja
       JOIN job_postings jp ON wja.job_posting_id = jp.id
       JOIN workers      w  ON wja.worker_id = w.id
       WHERE wja.worker_id = $1
         AND wja.job_posting_id <> $2
         AND wja.job_posting_id NOT IN (
           SELECT job_posting_id FROM encuadres WHERE worker_id = $1
         )`,
      [workerId, excludeJobPostingId],
    );
    return result.rows.map(r => ({
      jobPostingId:          r.job_posting_id,
      caseNumber:            r.case_number ? parseInt(r.case_number) : null,
      patientName:           r.patient_name,
      resultado:             r.resultado,
      registrationCompleted: r.registration_completed,
    }));
  }

  private mapJobPostingStats(r: Record<string, unknown>): JobPostingStats {
    return {
      jobPostingId:               r.job_posting_id as string,
      caseNumber:                 parseInt(r.case_number as string),
      patientName:                r.patient_name as string | null,
      caseStatus:                 r.case_status as string,
      priority:                   r.priority as string | null,
      dependency:                 r.dependency as string | null,
      coordinatorName:            r.coordinator_name as string | null,
      isCovered:                  r.is_covered as boolean,
      totalInterested:            parseInt(r.total_interested as string),
      totalPreScreened:           parseInt(r.total_pre_screened as string),
      totalInterviewed:           parseInt(r.total_interviewed as string),
      totalApproved:              parseInt(r.total_approved as string),
      totalRejected:              parseInt(r.total_rejected as string),
      totalNoAcepta:              parseInt(r.total_no_acepta as string),
      totalPending:               parseInt(r.total_pending as string),
      totalIncompleteRegistration: parseInt(r.total_incomplete_registration as string),
    };
  }
}
