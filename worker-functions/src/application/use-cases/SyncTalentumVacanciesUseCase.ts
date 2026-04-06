/**
 * SyncTalentumVacanciesUseCase
 *
 * Orchestrates: fetch all Talentum projects → parse descriptions via Gemini
 * → create or update vacancies in job_postings.
 *
 * Rules:
 *  - Only overwrite DB fields with non-null values from LLM (never erase existing data)
 *  - Errors on individual projects do not abort the sync
 *  - Always save Talentum reference columns (projectId, whatsappUrl, etc.)
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { TalentumApiClient } from '../../infrastructure/services/TalentumApiClient';
import { GeminiVacancyParserService, ParsedVacancyResult } from '../../infrastructure/services/GeminiVacancyParserService';
import type { TalentumProject } from '../../domain/interfaces/ITalentumApiClient';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface SyncReport {
  total: number;
  updated: number;
  created: number;
  skipped: number;
  errors: Array<{
    projectId: string;
    title: string;
    error: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────
// Use case
// ─────────────────────────────────────────────────────────────────

export class SyncTalentumVacanciesUseCase {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  async execute(opts?: { force?: boolean }): Promise<SyncReport> {
    const force = opts?.force ?? false;
    const report: SyncReport = {
      total: 0,
      updated: 0,
      created: 0,
      skipped: 0,
      errors: [],
    };

    // 1. Fetch all projects from Talentum
    const talentumClient = await TalentumApiClient.create();
    const projects = await talentumClient.listAllPrescreenings();
    report.total = projects.length;

    console.log(`[SyncTalentum] Fetched ${projects.length} projects from Talentum (force=${force})`);

    const geminiService = new GeminiVacancyParserService();

    // 2. Process projects in batches of 5 (parallel Gemini calls)
    const BATCH_SIZE = 5;
    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (project) => {
          try {
            await this.processProject(project, geminiService, report, force);
          } catch (err: any) {
            console.error(`[SyncTalentum] Error processing project ${project.projectId} ("${project.title}"):`, err.message);
            report.errors.push({
              projectId: project.projectId,
              title: project.title,
              error: err.message,
            });
          }
        }),
      );
    }

    console.log(
      `[SyncTalentum] Done: total=${report.total} updated=${report.updated} ` +
      `created=${report.created} skipped=${report.skipped} errors=${report.errors.length}`,
    );

    return report;
  }

  private async processProject(
    project: TalentumProject,
    geminiService: GeminiVacancyParserService,
    report: SyncReport,
    force = false,
  ): Promise<void> {
    // 2a. Extract case_number and vacancy_number from title
    //   "CASO 230"    → case_number=230, nova vacante
    //   "CASO 230-42" → case_number=230, vacancy_number=42 (vacante existente)
    const match = project.title.match(/CASO\s+(\d+)(?:-(\d+))?/i);
    const caseNumber = match ? parseInt(match[1], 10) : null;
    const parsedVacancyNumber = match?.[2] ? parseInt(match[2], 10) : null;

    // 2b. Lookup in DB — first by talentum_project_id, then by vacancy_number
    let existing: { id: string; talentum_project_id: string | null } | null = null;

    const byTalentum = await this.db.query(
      'SELECT id, talentum_project_id FROM job_postings WHERE talentum_project_id = $1',
      [project.projectId],
    );
    existing = byTalentum.rows[0] ?? null;

    // If not found by talentum_project_id, try by vacancy_number or case_number
    if (!existing && parsedVacancyNumber != null) {
      const byVacancy = await this.db.query(
        'SELECT id, talentum_project_id FROM job_postings WHERE vacancy_number = $1',
        [parsedVacancyNumber],
      );
      existing = byVacancy.rows[0] ?? null;
    }
    if (!existing && caseNumber != null) {
      const byCaseNumber = await this.db.query(
        `SELECT id, talentum_project_id FROM job_postings
         WHERE case_number = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [caseNumber],
      );
      existing = byCaseNumber.rows[0] ?? null;
    }

    // 2b'. Skip if already synced with this Talentum project (unless force)
    if (!force && existing?.talentum_project_id === project.projectId) {
      console.log(`[SyncTalentum] Skipping "${project.title}" — already synced (talentum_project_id=${project.projectId})`);
      report.skipped++;
      return;
    }

    // 2c. Parse description with Gemini
    const parsed = await geminiService.parseFromTalentumDescription(
      project.description,
      project.title,
    );

    // 2d. Create or update
    let jobPostingId: string;

    if (existing) {
      jobPostingId = existing.id;
      await this.updateFromSync(jobPostingId, parsed);
      report.updated++;
    } else {
      jobPostingId = await this.createFromSync(caseNumber, parsed);
      report.created++;
    }

    // 2e. Save Talentum reference
    await this.saveTalentumReference(jobPostingId, {
      talentum_project_id: project.projectId,
      talentum_public_id: project.publicId,
      talentum_whatsapp_url: project.whatsappUrl,
      talentum_slug: project.slug,
      talentum_published_at: project.timestamp,
      talentum_description: project.description,
    });

    console.log(
      `[SyncTalentum] ${existing ? 'Updated' : 'Created'} vacancy for "${project.title}" ` +
      `case_number=${caseNumber ?? 'null'} (id=${jobPostingId})`,
    );
  }

  /**
   * Updates an existing vacancy with non-null parsed fields only.
   * Never overwrites existing DB values with null from LLM.
   */
  private async updateFromSync(
    jobPostingId: string,
    parsed: ParsedVacancyResult['vacancy'],
  ): Promise<void> {
    const fieldMap: Array<{ column: string; value: unknown; jsonb?: boolean }> = [
      { column: 'required_professions', value: parsed.required_professions },
      { column: 'required_sex', value: parsed.required_sex },
      { column: 'age_range_min', value: parsed.age_range_min },
      { column: 'age_range_max', value: parsed.age_range_max },
      { column: 'required_experience', value: parsed.required_experience },
      { column: 'worker_attributes', value: parsed.worker_attributes },
      { column: 'schedule', value: parsed.schedule, jsonb: true },
      { column: 'work_schedule', value: parsed.work_schedule },
      { column: 'pathology_types', value: parsed.pathology_types },
      { column: 'dependency_level', value: parsed.dependency_level },
      { column: 'service_device_types', value: parsed.service_device_types },
      { column: 'providers_needed', value: parsed.providers_needed },
      { column: 'salary_text', value: parsed.salary_text },
      { column: 'payment_day', value: parsed.payment_day },
      { column: 'daily_obs', value: parsed.daily_obs },
      { column: 'city', value: parsed.city },
      { column: 'state', value: parsed.state },
    ];

    // Filter out null/undefined values — only update non-null fields
    const nonNull = fieldMap.filter(f => f.value != null);
    if (nonNull.length === 0) return;

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (let i = 0; i < nonNull.length; i++) {
      const f = nonNull[i];
      const paramIdx = i + 1;
      setClauses.push(`${f.column} = $${paramIdx}`);
      values.push(f.jsonb && typeof f.value === 'object' ? JSON.stringify(f.value) : f.value);
    }

    values.push(jobPostingId);
    const idIdx = values.length;

    await this.db.query(
      `UPDATE job_postings SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idIdx}`,
      values,
    );
  }

  /**
   * Creates a new vacancy from Talentum sync data.
   */
  private async createFromSync(
    caseNumber: number | null,
    parsed: ParsedVacancyResult['vacancy'],
  ): Promise<string> {
    const vnResult = await this.db.query<{ vn: string }>(
      "SELECT nextval('job_postings_vacancy_number_seq') AS vn",
    );
    const vacancyNumber = parseInt(vnResult.rows[0].vn);
    const title = caseNumber != null
      ? `CASO ${caseNumber}-${vacancyNumber}`
      : `VACANTE ${vacancyNumber}`;

    const result = await this.db.query(
      `INSERT INTO job_postings (
         vacancy_number, case_number, title, description, country, status,
         required_professions, required_sex,
         age_range_min, age_range_max,
         required_experience, worker_attributes,
         schedule, work_schedule,
         pathology_types, dependency_level,
         service_device_types,
         providers_needed, salary_text, payment_day,
         daily_obs, city, state
       ) VALUES (
         $1, $2, $3, '', 'AR', 'BUSQUEDA',
         $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20
       )
       RETURNING id`,
      [
        vacancyNumber,
        caseNumber,
        title,
        parsed.required_professions ?? [],
        parsed.required_sex ?? null,
        parsed.age_range_min ?? null,
        parsed.age_range_max ?? null,
        parsed.required_experience ?? null,
        parsed.worker_attributes ?? null,
        parsed.schedule ? JSON.stringify(parsed.schedule) : null,
        parsed.work_schedule ?? null,
        parsed.pathology_types ?? null,
        parsed.dependency_level ?? null,
        parsed.service_device_types ?? [],
        parsed.providers_needed ?? 1,
        parsed.salary_text ?? 'A convenir',
        parsed.payment_day ?? null,
        parsed.daily_obs ?? null,
        parsed.city ?? null,
        parsed.state ?? null,
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Persists Talentum reference columns on the job_posting.
   */
  private async saveTalentumReference(
    jobPostingId: string,
    ref: {
      talentum_project_id: string;
      talentum_public_id: string;
      talentum_whatsapp_url: string;
      talentum_slug: string;
      talentum_published_at: string;
      talentum_description: string;
    },
  ): Promise<void> {
    await this.db.query(
      `UPDATE job_postings
       SET talentum_project_id   = $1,
           talentum_public_id    = $2,
           talentum_whatsapp_url = $3,
           talentum_slug         = $4,
           talentum_published_at = $5,
           talentum_description  = $6,
           updated_at            = NOW()
       WHERE id = $7`,
      [
        ref.talentum_project_id,
        ref.talentum_public_id,
        ref.talentum_whatsapp_url,
        ref.talentum_slug,
        ref.talentum_published_at,
        ref.talentum_description,
        jobPostingId,
      ],
    );
  }
}
