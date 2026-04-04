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

  async execute(): Promise<SyncReport> {
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

    console.log(`[SyncTalentum] Fetched ${projects.length} projects from Talentum`);

    const geminiService = new GeminiVacancyParserService();

    // 2. Process each project
    for (const project of projects) {
      try {
        await this.processProject(project, geminiService, report);
      } catch (err: any) {
        console.error(`[SyncTalentum] Error processing project ${project.projectId} ("${project.title}"):`, err.message);
        report.errors.push({
          projectId: project.projectId,
          title: project.title,
          error: err.message,
        });
      }
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
  ): Promise<void> {
    // 2a. Extract case_number from title
    const match = project.title.match(/CASO\s+(\d+)/i);
    if (!match) {
      console.log(`[SyncTalentum] Skipping "${project.title}" — no case_number found`);
      report.skipped++;
      return;
    }
    const caseNumber = parseInt(match[1], 10);

    // 2b. Lookup in DB
    const existingResult = await this.db.query(
      'SELECT id FROM job_postings WHERE case_number = $1',
      [caseNumber],
    );
    const existing = existingResult.rows[0] ?? null;

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
      `[SyncTalentum] ${existing ? 'Updated' : 'Created'} vacancy for CASO ${caseNumber} (id=${jobPostingId})`,
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
    caseNumber: number,
    parsed: ParsedVacancyResult['vacancy'],
  ): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO job_postings (
         case_number, title, description, country, status,
         required_professions, required_sex,
         age_range_min, age_range_max,
         required_experience, worker_attributes,
         schedule, work_schedule,
         pathology_types, dependency_level,
         service_device_types,
         providers_needed, salary_text, payment_day,
         daily_obs, city, state
       ) VALUES (
         $1, $2, '', 'AR', 'BUSQUEDA',
         $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19
       )
       RETURNING id`,
      [
        caseNumber,
        `CASO ${caseNumber}`,
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
