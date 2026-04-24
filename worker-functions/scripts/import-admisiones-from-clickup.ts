#!/usr/bin/env ts-node
/**
 * import-admisiones-from-clickup.ts
 *
 * Paginates the ClickUp list "Admisiones AR" (901318451300) and for each task:
 *   1. Maps worker identity + encuadre via ClickUpEncuadreMapper
 *   2. Upserts the worker (fill-only: never overwrite non-null fields)
 *   3. Resolves job_posting_id from case_number
 *   4. Upserts the encuadre via EncuadreRepository.upsert()
 * After all tasks: calls EncuadreRepository.syncToWorkerJobApplications() once.
 *
 * ── Pre-requisites ────────────────────────────────────────────────────────────
 *   - CLICKUP_API_TOKEN set in environment
 *   - DATABASE_URL set (required in --live mode)
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   set -a && source worker-functions/.env && set +a
 *   cd worker-functions
 *   npx ts-node -r tsconfig-paths/register scripts/import-admisiones-from-clickup.ts --dry-run --limit 3
 *   npx ts-node -r tsconfig-paths/register scripts/import-admisiones-from-clickup.ts --live
 *
 * ── Flags ─────────────────────────────────────────────────────────────────────
 *   --dry-run          (default) logs what would happen; no DB writes
 *   --live             alias for --dry-run=false; persists to DB
 *   --limit N          process only the first N tasks
 *   --verbose          print full mapped payload per task
 *   --list-id <id>     ClickUp list ID (default: 901318451300 Admisiones AR)
 *                      Pass 901322014034 for Admisiones BR
 */

/* eslint-disable no-console */

import { Pool } from 'pg';
import { ClickUpFieldResolver } from '../src/modules/integration/infrastructure/clickup/ClickUpFieldResolver';
import { ClickUpEncuadreMapper } from '../src/modules/integration/infrastructure/clickup/ClickUpEncuadreMapper';
import { normalizePhoneAR } from '../src/shared/utils/phoneNormalization';
import { KMSEncryptionService } from '../src/shared/security/KMSEncryptionService';
import type { ClickUpTask } from '../src/modules/integration/infrastructure/clickup/ClickUpTask';
import type { CreateEncuadreDTO } from '../src/modules/matching/domain/Encuadre';
import { upsertWorkerFromEncuadre, resolveJobPostingId } from './admisiones-worker-upsert';

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_LIST_ID  = '901318451300'; // Admisiones AR
const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const SCRIPT_TAG       = '[import-admisiones-from-clickup]';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function hasFlag(name: string): boolean { return argv.includes(name); }

function flagValue(name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

let isDryRun = true;
if (hasFlag('--live')) isDryRun = false;
const dryRunFlag = argv.find(a => a.startsWith('--dry-run='));
if (dryRunFlag) isDryRun = dryRunFlag.split('=')[1] !== 'false';

const limitRaw  = flagValue('--limit');
const limit     = limitRaw !== null ? parseInt(limitRaw, 10) : null;
const isVerbose = hasFlag('--verbose');
const listId    = flagValue('--list-id') ?? DEFAULT_LIST_ID;

// ── Env validation ─────────────────────────────────────────────────────────────

const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
if (!CLICKUP_TOKEN) {
  console.error(`${SCRIPT_TAG} ERROR: CLICKUP_API_TOKEN is not set.`);
  process.exit(1);
}

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

if (!isDryRun && !process.env.DATABASE_URL) {
  console.error(`${SCRIPT_TAG} ERROR: DATABASE_URL is required in --live mode.`);
  process.exit(1);
}

// ── ClickUp pagination ────────────────────────────────────────────────────────

interface TasksPage { tasks: ClickUpTask[]; last_page: boolean; }

async function fetchPage(page: number): Promise<TasksPage> {
  const url =
    `${CLICKUP_API_BASE}/list/${listId}/task` +
    `?page=${page}&archived=false&subtasks=false&include_closed=true`;
  const res = await fetch(url, { headers: { Authorization: CLICKUP_TOKEN as string } });
  if (!res.ok) {
    throw new Error(`ClickUp /task failed: HTTP ${res.status} ${res.statusText} (page ${page})`);
  }
  return (await res.json()) as TasksPage;
}

async function fetchAllTasks(): Promise<ClickUpTask[]> {
  console.log(`${SCRIPT_TAG} Fetching ClickUp list ${listId}...`);
  const all: ClickUpTask[] = [];
  let page = 0;
  while (true) {
    const { tasks, last_page } = await fetchPage(page);
    all.push(...tasks);
    console.log(`  page ${page}: +${tasks.length} tasks (total ${all.length})`);
    if (last_page || tasks.length === 0) break;
    page++;
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const allTasks = await fetchAllTasks();
  console.log(`Fetched ${allTasks.length} tasks.\n`);

  const tasksToProcess = limit !== null ? allTasks.slice(0, limit) : allTasks;
  const modeStr  = isDryRun ? 'dry-run=true' : 'live (DB writes enabled)';
  const limitStr = limit !== null ? `limit=${limit}` : 'no limit';
  console.log(`Processing with flags: ${modeStr} ${limitStr} list=${listId}\n`);

  // Build resolver + mapper (fetches field definitions from ClickUp once)
  const resolver = await ClickUpFieldResolver.fromList(listId, { token: CLICKUP_TOKEN });
  const mapper   = new ClickUpEncuadreMapper(resolver);

  // DB connections — lazy; dry-run tries optionally (not critical)
  let pool: Pool | null = null;
  let encService: KMSEncryptionService | null = null;
  let encuadreRepo: import('../src/modules/matching/infrastructure/EncuadreRepository').EncuadreRepository | null = null;

  if (!isDryRun) {
    pool       = new Pool({ connectionString: DATABASE_URL });
    encService = new KMSEncryptionService();
    const { EncuadreRepository } = await import('../src/modules/matching/infrastructure/EncuadreRepository');
    encuadreRepo = new EncuadreRepository();
  } else {
    try { pool = new Pool({ connectionString: DATABASE_URL }); } catch { /* no-op */ }
  }

  // Counters
  let skippedSubtask    = 0;
  let skippedNoIdent    = 0;
  let skippedNoCaseNum  = 0;
  let workersCreated    = 0;
  let workersUpdated    = 0;
  let encuadresCreated  = 0;
  let encuadresExisted  = 0;
  let jobPostingsNotFound = 0;
  let errors            = 0;
  let processed         = 0;

  for (let i = 0; i < tasksToProcess.length; i++) {
    const task = tasksToProcess[i];
    const num  = `[${i + 1}/${tasksToProcess.length}]`;

    if (task.parent !== null) { skippedSubtask++; continue; }

    let output: ReturnType<ClickUpEncuadreMapper['map']>;
    try {
      output = mapper.map(task);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR  task=${task.id} mapper threw: ${msg}`);
      errors++;
      continue;
    }

    if (output === null) {
      console.log(`  ${num} task=${task.id} status=${task.status.status} → SKIPPED (no email and no whatsapp)`);
      skippedNoIdent++;
      continue;
    }

    processed++;
    const { worker: wData, encuadre: eData } = output;
    const normalizedPhone = wData.rawWhatsapp ? normalizePhoneAR(wData.rawWhatsapp) || null : null;

    if (isDryRun) {
      if (eData.caseNumber === null) skippedNoCaseNum++;
      const caseStr = eData.caseNumber !== null
        ? `caseNumber=${eData.caseNumber}`
        : 'caseNumber=null (WARN)';
      console.log(
        `  ${num} task=${task.id} status=${task.status.status} → would UPSERT` +
        ` worker(email=${wData.email ?? 'null'}, phone=${normalizedPhone ?? 'null'})` +
        ` encuadre(resultado=${eData.resultado}, ${caseStr})`,
      );
      if (isVerbose) {
        console.log('         payload:', JSON.stringify({ worker: wData, encuadre: eData }, null, 2));
      }
      continue;
    }

    // Live mode
    try {
      const wResult = await upsertWorkerFromEncuadre(
        { ...wData, phone: normalizedPhone },
        pool!,
        encService!,
      );
      if (wResult.created) { workersCreated++; } else { workersUpdated++; }

      let jobPostingId: string | null = null;
      if (eData.caseNumber !== null) {
        jobPostingId = await resolveJobPostingId(pool!, eData.caseNumber);
        if (!jobPostingId) {
          console.log(`  WARN   task=${task.id} caseNumber=${eData.caseNumber} — job_posting not found`);
          jobPostingsNotFound++;
        }
      } else {
        skippedNoCaseNum++;
        console.log(`  WARN   task=${task.id} — Caso Número not set`);
      }

      const dto: CreateEncuadreDTO = {
        workerId:      wResult.id,
        jobPostingId,
        workerRawName:  eData.rawName,
        workerRawPhone: eData.rawPhone,
        workerEmail:    wData.email,
        resultado:      eData.resultado,
        origen:         eData.origen,
        dedupHash:      eData.dedupHash,
      };
      const { created: encCreated } = await encuadreRepo!.upsert(dto);
      if (encCreated) { encuadresCreated++; } else { encuadresExisted++; }

      const wAction = wResult.created ? 'CREATED' : 'UPDATED';
      const eAction = encCreated ? 'CREATED' : 'EXISTED';
      console.log(
        `  ${num} task=${task.id} → worker ${wAction} id=${wResult.id}` +
        ` encuadre ${eAction} resultado=${eData.resultado}`,
      );
      if (isVerbose) {
        console.log('         payload:', JSON.stringify({ worker: wData, encuadre: eData }, null, 2));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR  task=${task.id} msg=${msg}`);
      if (err instanceof Error && err.stack) {
        console.log(`         stack: ${err.stack.split('\n').slice(0, 5).join(' | ')}`);
      }
      errors++;
    }
  }

  // Post-sync (live only)
  if (!isDryRun && encuadreRepo) {
    try {
      const synced = await encuadreRepo.syncToWorkerJobApplications();
      console.log(`\nPost-sync: syncToWorkerJobApplications → ${synced} rows affected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\nERROR syncToWorkerJobApplications: ${msg}`);
    }
  }

  // Summary
  console.log('\nSummary:');
  console.log(`  Fetched:                             ${allTasks.length} tasks`);
  console.log(`  Processed:                           ${processed}${limit !== null ? ` (limit=${limit})` : ''}`);
  console.log(`  Skipped (subtask):                   ${skippedSubtask}`);
  console.log(`  Skipped (no email/phone):            ${skippedNoIdent}`);
  console.log(`  Job postings not found:              ${jobPostingsNotFound}`);
  console.log(`  Tasks with Caso Número null (warn):  ${skippedNoCaseNum}`);
  if (isDryRun) {
    console.log(`  Would upsert workers:                ${processed}`);
    console.log(`  Would upsert encuadres:              ${processed}`);
  } else {
    console.log(`  Workers created:                     ${workersCreated}`);
    console.log(`  Workers updated:                     ${workersUpdated}`);
    console.log(`  Encuadres created:                   ${encuadresCreated}`);
    console.log(`  Encuadres already existed (idem):    ${encuadresExisted}`);
  }
  console.log(`  Errors:                              ${errors}`);
  console.log(`  Mode:                                ${isDryRun ? 'DRY-RUN (no DB writes)' : 'LIVE (DB writes committed)'}`);

  if (pool) await pool.end();
  if (errors > 0 && !isDryRun) process.exit(1);
}

main().catch(err => {
  console.error(`${SCRIPT_TAG} Fatal error:`, err);
  process.exit(1);
});
