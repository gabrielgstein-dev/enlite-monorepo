/**
 * One-shot backfill: generates Short.io 'site' links for all active public vacancies
 * that don't have one yet.
 *
 * Usage: npx ts-node scripts/backfill-vacancy-short-links.ts [--dry-run]
 */

import { Pool } from 'pg';
import { ShortLinkService } from '../src/modules/matching/infrastructure/shortlinks/ShortLinkService';
import { EnsureVacancyShortLinkUseCase } from '../src/modules/matching/application/EnsureVacancyShortLinkUseCase';

const isDryRun = process.argv.includes('--dry-run');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

interface VacancyRow {
  id: string;
  case_number: number;
  vacancy_number: number;
  title: string;
}

async function main(): Promise<void> {
  const shortLinkService = ShortLinkService.fromEnv();
  if (!shortLinkService) {
    console.error(
      '[backfill] ERROR: SHORT_IO_API_KEY and SHORT_IO_DOMAIN must be set in the environment.',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const { rows } = await pool.query<VacancyRow>(
      `SELECT id, case_number, vacancy_number, title
       FROM job_postings
       WHERE status IN ('SEARCHING', 'SEARCHING_REPLACEMENT', 'RAPID_RESPONSE')
         AND deleted_at IS NULL
         AND (social_short_links->>'site') IS NULL
       ORDER BY case_number DESC, vacancy_number DESC`,
    );

    if (rows.length === 0) {
      console.log('[backfill] No vacancies need backfill. All done.');
      return;
    }

    console.log(`[backfill] Found ${rows.length} vacancies to backfill.${isDryRun ? ' (DRY RUN — no links will be created)' : ''}`);

    const useCase = new EnsureVacancyShortLinkUseCase(pool, shortLinkService);

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      const label = `${row.title} (id=${row.id})`;
      if (isDryRun) {
        console.log(`[backfill] [DRY RUN] Would create site link for: ${label}`);
        success++;
        continue;
      }

      try {
        const result = await useCase.execute(row.id, 'site');
        if (result.alreadyExisted) {
          console.log(`[backfill] SKIP (already exists): ${label}`);
        } else {
          console.log(`[backfill] OK: ${label} → ${result.shortURL}`);
          success++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[backfill] ERROR for ${label}: ${message}`);
        failed++;
      }
    }

    console.log(`[backfill] Done. success=${success}, failed=${failed}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
