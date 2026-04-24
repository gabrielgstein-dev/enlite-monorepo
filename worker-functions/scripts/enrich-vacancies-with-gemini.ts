#!/usr/bin/env ts-node
/**
 * enrich-vacancies-with-gemini.ts  — Fase 3
 *
 * Reads job_postings with unstructured text and calls Gemini to extract
 * structured fields into the schema columns from migration 107.
 * Fill-only semantics: COALESCE — never overwrites existing values
 * unless --force is passed.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/enrich-vacancies-with-gemini.ts \
 *     --dry-run --limit 5 --verbose
 *   npx ts-node -r tsconfig-paths/register scripts/enrich-vacancies-with-gemini.ts \
 *     --live --limit 10 --verbose
 *
 * Flags:
 *   --dry-run          (default) no DB writes
 *   --live             enables DB writes
 *   --limit N          process only first N candidates
 *   --verbose          print full Gemini result per vacancy
 *   --force            re-process even if schedule already populated
 *   --rate-limit-ms N  delay between Gemini calls in ms (default 200)
 */

/* eslint-disable no-console */

import { Pool } from 'pg';
import { GeminiVacancyParserService } from '../src/modules/integration/infrastructure/GeminiVacancyParserService';
import {
  buildInputText,
  inferWorkerType,
  validateSchedule,
  validateRequiredSex,
  validateAge,
  validateProfessions,
  applyEnrichment,
  applyEnrichmentForce,
  callGeminiWithRetry,
  sleep,
  JobPostingRow,
  EnrichmentPatch,
  ValidationCounters,
} from './enrich-vacancies-helpers';

// ── Arg parsing ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function hasFlag(name: string): boolean { return argv.includes(name); }
function flagValue(name: string): string | null {
  const idx = argv.indexOf(name);
  return idx === -1 ? null : (argv[idx + 1] ?? null);
}

let isDryRun = true;
if (hasFlag('--live')) isDryRun = false;
const dryRunFlag = argv.find((a) => a.startsWith('--dry-run='));
if (dryRunFlag) isDryRun = dryRunFlag.split('=')[1] !== 'false';

const limitRaw    = flagValue('--limit');
const limit       = limitRaw !== null ? parseInt(limitRaw, 10) : null;
const isVerbose   = hasFlag('--verbose');
const forceMode   = hasFlag('--force');
const rateLimitMs = parseInt(flagValue('--rate-limit-ms') ?? '200', 10);

const SCRIPT_TAG = '[enrich-vacancies-with-gemini]';

// ── Env ────────────────────────────────────────────────────────────────────────

if (!process.env.GEMINI_API_KEY) {
  console.error(`${SCRIPT_TAG} ERROR: GEMINI_API_KEY is not set.`);
  process.exit(1);
}

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

if (!isDryRun && !process.env.DATABASE_URL) {
  console.error(`${SCRIPT_TAG} ERROR: DATABASE_URL is required in --live mode.`);
  process.exit(1);
}

// ── DB fetch ───────────────────────────────────────────────────────────────────

async function fetchCandidates(pool: Pool, lim: number | null): Promise<JobPostingRow[]> {
  const scheduleFilter = forceMode
    ? ''
    : `AND (jp.schedule IS NULL OR jp.schedule = 'null'::jsonb)`;
  const limitClause = lim !== null ? `LIMIT ${lim}` : '';

  const { rows } = await pool.query<JobPostingRow>(`
    SELECT
      jp.id, jp.title, jp.worker_profile_sought, jp.schedule_days_hours,
      jp.daily_obs, jp.service_address_raw, jp.required_professions,
      jp.schedule, jp.required_sex, jp.age_range_min, jp.age_range_max,
      jp.required_experience, jp.worker_attributes, jp.pathology_types,
      jp.dependency_level, jp.service_device_types, jp.salary_text,
      jp.payment_day, jp.enriched_at
    FROM job_postings jp
    WHERE jp.deleted_at IS NULL
      ${scheduleFilter}
      AND (jp.schedule_days_hours IS NOT NULL
           OR jp.worker_profile_sought IS NOT NULL
           OR jp.title IS NOT NULL)
    ORDER BY jp.created_at ASC
    ${limitClause}
  `);
  return rows;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pool   = new Pool({ connectionString: DATABASE_URL });
  const gemini = new GeminiVacancyParserService();

  console.log(`${SCRIPT_TAG} Starting enrichment`);
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}  Force: ${forceMode}  Limit: ${limit ?? 'none'}  Rate-limit-ms: ${rateLimitMs}\n`);

  const candidates = await fetchCandidates(pool, limit);
  console.log(`${SCRIPT_TAG} Candidates: ${candidates.length}\n`);

  const c = {
    processed: 0, skipped_already_enriched: 0,
    gemini_success: 0, gemini_retry: 0, gemini_failure: 0,
    schedule_extracted: 0, schedule_invalid_dropped: 0,
    fields_required_professions: 0, fields_required_sex: 0, fields_age_range: 0,
    fields_required_experience: 0, fields_worker_attributes: 0,
    fields_pathology_types: 0, fields_dependency_level: 0,
    fields_service_device_types: 0, fields_salary_text: 0, fields_payment_day: 0,
    db_updated: 0, errors: 0,
  };

  const vc: ValidationCounters = {
    invalid_schedule: 0, invalid_required_sex: 0,
    invalid_age_range: 0, invalid_professions: 0, invalid_fields_skipped: 0,
  };

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const num = `[${i + 1}/${candidates.length}]`;

    if (!forceMode && row.enriched_at !== null) {
      c.skipped_already_enriched++;
      console.log(`  ${num} id=${row.id} → SKIP (already enriched)`);
      continue;
    }

    const inputText = buildInputText(row);
    if (!inputText.trim()) {
      console.log(`  ${num} id=${row.id} → SKIP (no input text)`);
      continue;
    }

    const workerType = inferWorkerType(row);
    console.log(`  ${num} id=${row.id} workerType=${workerType} textLen=${inputText.length}`);

    const result = await callGeminiWithRetry(gemini, inputText, workerType, c, row.title ?? '');

    if (result === null) {
      console.error(`  ERROR  id=${row.id} → Gemini failed`);
      c.errors++;
      await sleep(rateLimitMs);
      continue;
    }

    const v = result.vacancy;
    if (isVerbose) console.log(`         Gemini result:`, JSON.stringify(v, null, 2));

    const validatedSchedule    = validateSchedule(v.schedule, vc);
    const validatedSex         = validateRequiredSex(v.required_sex, vc);
    const validatedAgeMin      = validateAge(v.age_range_min, vc);
    const validatedAgeMax      = validateAge(v.age_range_max, vc);
    const validatedProfessions = validateProfessions(v.required_professions, vc);

    if (validatedSchedule !== null)                           c.schedule_extracted++;
    else if (Array.isArray(v.schedule) && v.schedule.length)  c.schedule_invalid_dropped++;

    const patch: EnrichmentPatch = {
      schedule:             validatedSchedule,
      required_professions: validatedProfessions,
      required_sex:         validatedSex,
      age_range_min:        validatedAgeMin,
      age_range_max:        validatedAgeMax,
      required_experience:  v.required_experience ?? null,
      worker_attributes:    v.worker_attributes ?? null,
      pathology_types:      v.pathology_types ?? null,
      dependency_level:     v.dependency_level ?? null,
      service_device_types: Array.isArray(v.service_device_types) ? v.service_device_types : [],
      salary_text:          v.salary_text ?? null,
      payment_day:          v.payment_day ?? null,
    };

    if (validatedProfessions.length > 0)                            c.fields_required_professions++;
    if (validatedSex !== null)                                       c.fields_required_sex++;
    if (validatedAgeMin !== null || validatedAgeMax !== null)        c.fields_age_range++;
    if (patch.required_experience)                                   c.fields_required_experience++;
    if (patch.worker_attributes)                                     c.fields_worker_attributes++;
    if (patch.pathology_types)                                       c.fields_pathology_types++;
    if (patch.dependency_level)                                      c.fields_dependency_level++;
    if (patch.service_device_types.length > 0)                      c.fields_service_device_types++;
    if (patch.salary_text)                                           c.fields_salary_text++;
    if (patch.payment_day)                                           c.fields_payment_day++;

    if (isDryRun) {
      console.log(`         [dry-run] would UPDATE id=${row.id} ` +
        `schedule=${validatedSchedule !== null ? 'ok' : 'null'} ` +
        `sex=${validatedSex} professions=${validatedProfessions.join(',')}`);
    } else {
      try {
        await (forceMode ? applyEnrichmentForce : applyEnrichment)(pool, row.id, patch);
        c.db_updated++;
        console.log(`         UPDATED id=${row.id}`);
      } catch (err) {
        console.error(`  ERROR  id=${row.id} DB: ${err instanceof Error ? err.message : err}`);
        c.errors++;
      }
    }

    c.processed++;
    await sleep(rateLimitMs);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\nSummary:');
  console.log(`  Vagas candidatas:                  ${candidates.length}`);
  console.log(`  Processadas:                       ${c.processed}`);
  console.log(`  Skipped (já enriquecidas):         ${c.skipped_already_enriched}`);
  console.log(`  Gemini success:                    ${c.gemini_success}`);
  console.log(`  Gemini retry (success after retry):${c.gemini_retry}`);
  console.log(`  Gemini failure (após retry):       ${c.gemini_failure}`);
  console.log(`  Schedule extraído:                 ${c.schedule_extracted}`);
  console.log(`  Schedule inválido (dropped):       ${c.schedule_invalid_dropped}`);
  console.log(`  Campos required_professions:       ${c.fields_required_professions}`);
  console.log(`  Campos required_sex:               ${c.fields_required_sex}`);
  console.log(`  Campos age_range:                  ${c.fields_age_range}`);
  console.log(`  Campos required_experience:        ${c.fields_required_experience}`);
  console.log(`  Campos worker_attributes:          ${c.fields_worker_attributes}`);
  console.log(`  Campos pathology_types:            ${c.fields_pathology_types}`);
  console.log(`  Campos dependency_level:           ${c.fields_dependency_level}`);
  console.log(`  Campos service_device_types:       ${c.fields_service_device_types}`);
  console.log(`  Campos salary_text:                ${c.fields_salary_text}`);
  console.log(`  Campos payment_day:                ${c.fields_payment_day}`);
  console.log(`  Invalid fields skipped (total):    ${vc.invalid_fields_skipped}`);
  if (!isDryRun) console.log(`  DB rows updated:                   ${c.db_updated}`);
  console.log(`  Errors:                            ${c.errors}`);
  console.log(`  Mode:                              ${isDryRun ? 'DRY-RUN' : 'LIVE'}`);

  await pool.end();
  if (c.errors > 0 && !isDryRun) process.exit(1);
}

main().catch((err) => {
  console.error(`${SCRIPT_TAG} Fatal error:`, err);
  process.exit(1);
});
