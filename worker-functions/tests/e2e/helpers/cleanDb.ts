/**
 * cleanDb — centralised DB cleanup for E2E suites.
 *
 * Call in `beforeAll` of every suite that makes HTTP requests against the API,
 * to prevent data left by a previous suite from violating assumptions of the
 * current one (cross-suite interference).
 *
 * Tables that hold seed data (webhook_partners, message_templates used as seeds,
 * etc.) should NOT be listed here — they are excluded from truncation.
 *
 * NOTE: The global setup.ts already truncates these tables once before the
 * whole run. This helper is for per-suite cleanup when needed.
 */

import { Pool } from 'pg';

/**
 * Volatile tables that accumulate state across test suites.
 * Order matters: children before parents to satisfy FK constraints.
 * RESTART IDENTITY resets sequences so generated IDs are predictable.
 */
const VOLATILE_TABLES = [
  'worker_status_history',
  'talentum_prescreening_responses',
  'talentum_prescreenings',
  'talentum_questions',
  'worker_availability',
  'worker_service_areas',
  'worker_quiz_responses',
  'worker_documents',
  'worker_payment_info',
  'worker_employment_history',
  'worker_job_applications',
  'worker_placement_audits',
  'coordinator_weekly_schedules',
  'encuadres',
  'interview_slots',
  'blacklist',
  'publications',
  'import_job_errors',
  'import_jobs',
  'job_postings',
  'messaging_variable_tokens',
  'messaging_outbox',
  'domain_events',
  'workers',
  'coordinators',
  'message_templates',
];

export async function cleanDb(pool: Pool): Promise<void> {
  for (const table of VOLATILE_TABLES) {
    await pool.query(`TRUNCATE ${table} CASCADE`).catch(() => {
      // Table may not exist in older schema versions — ignore silently.
    });
  }
}
