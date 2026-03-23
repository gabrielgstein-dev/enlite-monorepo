#!/usr/bin/env ts-node
/**
 * Enriquece em bulk todos os job_postings pendentes com LLM.
 * Parseia worker_profile_sought e schedule_days_hours → campos estruturados.
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/enrich-job-postings.ts
 *   npx ts-node -r dotenv/config scripts/enrich-job-postings.ts --all   (re-enriquece já processados)
 */

import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';
import { JobPostingEnrichmentService } from '../src/infrastructure/services/JobPostingEnrichmentService';

const rerunAll = process.argv.includes('--all');

async function main() {
  const db = DatabaseConnection.getInstance().getPool();
  const svc = new JobPostingEnrichmentService();

  const whereClause = rerunAll
    ? `WHERE case_number IS NOT NULL AND (worker_profile_sought IS NOT NULL OR schedule_days_hours IS NOT NULL)`
    : `WHERE case_number IS NOT NULL AND (worker_profile_sought IS NOT NULL OR schedule_days_hours IS NOT NULL) AND llm_enriched_at IS NULL`;

  const { rows } = await db.query(
    `SELECT id, case_number FROM job_postings ${whereClause} ORDER BY case_number`
  );

  console.log(`\n🤖 Enriquecendo ${rows.length} job_postings com LLM${rerunAll ? ' (--all: re-processa todos)' : ''}...\n`);

  let ok = 0, errors = 0;

  for (const row of rows) {
    try {
      const result = await svc.enrichJobPosting(row.id);
      const schedule = result.parsed_schedule
        ? `dias=[${result.parsed_schedule.days.join(',')}]`
        : 'sem horário';
      console.log(
        `  ✅ Caso ${row.case_number} | profissão=${result.required_profession ?? 'null'} sexo=${result.required_sex ?? 'null'} | diagnósticos=[${result.required_diagnoses.join(', ')}] | ${schedule}`
      );
      ok++;
    } catch (err) {
      console.error(`  ❌ Caso ${row.case_number}:`, (err as Error).message);
      errors++;
    }
    await new Promise(r => setTimeout(r, 150)); // rate limit Groq: 30 req/min
  }

  console.log(`\n📊 Resultado: ${ok} enriquecidos | ${errors} erros`);
  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
