/**
 * CreateJobPostingFromTalentumUseCase
 *
 * Creates a job_posting when Talentum fires a PRESCREENING.CREATED event.
 *
 * Rules:
 *  - Title is always "CASO {next_case_number}" — data.name from Talentum is ignored
 *  - Status is always BUSQUEDA
 *  - Country defaults to AR
 *  - If talentum_project_id already exists → skip silently (anti-loop)
 *  - Unique constraint violation (23505) on talentum_project_id → treat as skip (race condition)
 *  - environment parameter is used only for logging, not persisted on job_postings
 */

import { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────────

export interface CreateJobPostingFromTalentumInput {
  _id: string;
  name: string;
}

export interface CreateJobPostingFromTalentumResult {
  created: boolean;
  skipped: boolean;
  jobPostingId?: string;
  caseNumber?: number;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────
// Use case
// ─────────────────────────────────────────────────────────────────

export class CreateJobPostingFromTalentumUseCase {
  constructor(private readonly pool: Pool) {}

  async execute(
    data: CreateJobPostingFromTalentumInput,
    environment: string,
  ): Promise<CreateJobPostingFromTalentumResult> {
    console.log(
      `[CreateJobPostingFromTalentum] Received event — talentum_project_id=${data._id} ` +
      `name="${data.name}" environment=${environment}`,
    );

    // ── 1. Anti-loop: verificar se já existe ────────────────────────
    const existing = await this.pool.query<{ id: string }>(
      'SELECT id FROM job_postings WHERE talentum_project_id = $1',
      [data._id],
    );

    if (existing.rows.length > 0) {
      const jobPostingId = existing.rows[0].id;
      console.log(
        `[CreateJobPostingFromTalentum] Skip — talentum_project_id=${data._id} already linked to job_posting=${jobPostingId}`,
      );
      return {
        created: false,
        skipped: true,
        jobPostingId,
        reason: 'already_exists',
      };
    }

    // ── 2. Gerar próximo case_number ────────────────────────────────
    const nextCaseResult = await this.pool.query<{ next: number }>(
      'SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM job_postings',
    );
    const caseNumber: number = nextCaseResult.rows[0].next;
    const title = `CASO ${caseNumber}`;

    // ── 3. Inserir job_posting ──────────────────────────────────────
    try {
      const insertResult = await this.pool.query<{ id: string }>(
        `INSERT INTO job_postings (
           case_number, title, description,
           status, country,
           talentum_project_id, talentum_published_at
         ) VALUES (
           $1, $2, '',
           'BUSQUEDA', 'AR',
           $3, NOW()
         )
         RETURNING id`,
        [caseNumber, title, data._id],
      );

      const jobPostingId = insertResult.rows[0].id;

      console.log(
        `[CreateJobPostingFromTalentum] Created job_posting=${jobPostingId} ` +
        `case_number=${caseNumber} title="${title}" talentum_project_id=${data._id}`,
      );

      return {
        created: true,
        skipped: false,
        jobPostingId,
        caseNumber,
      };
    } catch (err: any) {
      // ── 4. Race condition: unique_violation em talentum_project_id ──
      if (err.code === '23505') {
        const raceExisting = await this.pool.query<{ id: string }>(
          'SELECT id FROM job_postings WHERE talentum_project_id = $1',
          [data._id],
        );
        const jobPostingId = raceExisting.rows[0]?.id;

        console.log(
          `[CreateJobPostingFromTalentum] Race condition — talentum_project_id=${data._id} ` +
          `already inserted concurrently, job_posting=${jobPostingId ?? 'unknown'}`,
        );

        return {
          created: false,
          skipped: true,
          jobPostingId,
          reason: 'race_condition',
        };
      }

      throw err;
    }
  }
}

export default CreateJobPostingFromTalentumUseCase;
