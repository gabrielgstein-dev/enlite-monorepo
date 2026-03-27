#!/usr/bin/env ts-node
/**
 * snapshot-prod-to-seed.ts
 *
 * Conecta ao banco de produção, exporta as tabelas principais com PII anonimizado
 * e gera seeds/999_prod_snapshot.sql — pronto para uso com `make dev`.
 *
 * Uso:
 *   PROD_DATABASE_URL="postgresql://user:pass@host/db" \
 *   npx ts-node -r dotenv/config scripts/snapshot-prod-to-seed.ts
 *
 * Regras de PII:
 *   - Nomes, e-mails, telefones, documentos → anonimizados deterministicamente por row ID
 *   - Colunas *_encrypted → NULL (chaves KMS não existem localmente)
 *   - Dados estruturais (status, datas, FKs) → mantidos para ambiente realista
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL;
const SEEDS_DIR = path.join(__dirname, '..', 'seeds');
const OUTPUT_FILE = path.join(SEEDS_DIR, '999_prod_snapshot.sql');
const ROW_LIMIT = parseInt(process.env.SNAPSHOT_LIMIT ?? '500', 10);

if (!PROD_DATABASE_URL) {
  console.error('❌  PROD_DATABASE_URL é obrigatório.');
  console.error('    Exemplo: PROD_DATABASE_URL="postgresql://..." npm run snapshot:seed');
  process.exit(1);
}

// ── PII anonymization ─────────────────────────────────────────────────────────

const FIRST_NAMES = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Avery'];
const LAST_NAMES  = ['Silva', 'Santos', 'Oliveira', 'Costa', 'Ferreira', 'Lima', 'Carvalho', 'Souza'];

function h(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function fakeName(id: string): string {
  const hx = h(id);
  return `${FIRST_NAMES[parseInt(hx.slice(0, 2), 16) % FIRST_NAMES.length]} ` +
         `${LAST_NAMES[parseInt(hx.slice(2, 4), 16) % LAST_NAMES.length]}`;
}

function fakeEmail(id: string): string {
  return `snap_${h(id).slice(0, 8)}@dev.enlite`;
}

function fakePhone(id: string): string {
  return `5491${parseInt(h(id).slice(0, 6), 16).toString().slice(0, 6).padStart(6, '0')}`;
}

function fakeDocument(id: string): string {
  return parseInt(h(id).slice(0, 8), 16).toString().slice(0, 8).padStart(8, '0');
}

// Colunas PII → tipo de anonimização
const PII_RULES: Array<[RegExp, 'name' | 'email' | 'phone' | 'doc' | 'null']> = [
  [/^full_name$/,                     'name'],
  [/^(first_name|last_name)$/,        'name'],
  [/^patient_name$/,                  'name'],
  [/^worker_raw_name$/,               'name'],
  [/^responsible_(first|last)_name$/, 'name'],
  [/^treating_professional/,          'name'],
  [/^recruiter_name$/,                'null'],
  [/^coordinator_name$/,              'null'],
  [/email/,                           'email'],
  [/phone|whatsapp|telefon/i,         'phone'],
  [/document_number/,                 'doc'],
  [/^affiliate_id$/,                  'doc'],
  [/^responsible_document_number$/,   'doc'],
  [/^cuit$/,                          'doc'],
  [/_encrypted$/,                     'null'],
];

function anonymize(row: Record<string, unknown>, id: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    let done = false;
    for (const [pattern, kind] of PII_RULES) {
      if (!pattern.test(col)) continue;
      switch (kind) {
        case 'name':  out[col] = val != null ? fakeName(id + col) : null;     break;
        case 'email': out[col] = val != null ? fakeEmail(id) : null;          break;
        case 'phone': out[col] = val != null ? fakePhone(id + col) : null;    break;
        case 'doc':   out[col] = val != null ? fakeDocument(id + col) : null; break;
        case 'null':  out[col] = null;                                          break;
      }
      done = true;
      break;
    }
    if (!done) out[col] = val;
  }
  return out;
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'";
    return `ARRAY[${val.map(sqlLiteral).join(', ')}]`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildInserts(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');
  const stmts = rows.map(row => {
    const vals = cols.map(c => sqlLiteral(row[c])).join(', ');
    return `INSERT INTO ${table} (${colList}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;`;
  });
  return `-- ${table}: ${rows.length} rows\n${stmts.join('\n')}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function snapshot() {
  const prod = new Pool({ connectionString: PROD_DATABASE_URL });
  const sections: string[] = [
    `-- ============================================================`,
    `-- Prod snapshot — ${new Date().toISOString()}`,
    `-- PII anonimizado. Campos _encrypted = NULL.`,
    `-- NÃO commitar este arquivo se contiver dados reais.`,
    `-- ============================================================`,
    '',
  ];

  // IDs já capturados, para filtrar FKs de tabelas dependentes
  const captured: Record<string, string[]> = {
    workers:      [],
    patients:     [],
    job_postings: [],
  };

  async function dump(
    table: string,
    { hasPii = false, where = '', orderBy = 'created_at DESC' } = {}
  ): Promise<void> {
    const clause = where ? `WHERE ${where}` : '';
    const q = `SELECT * FROM ${table} ${clause} ORDER BY ${orderBy} LIMIT ${ROW_LIMIT}`;

    let rows: Record<string, unknown>[];
    try {
      const res = await prod.query(q);
      rows = res.rows;
    } catch (err: any) {
      console.warn(`⚠️  ${table}: pulado (${err.message})`);
      sections.push(`-- SKIPPED: ${table}\n`);
      return;
    }

    const processed = hasPii
      ? rows.map(row => anonymize(row, String(row.id ?? row.worker_id ?? row.clickup_task_id ?? '')))
      : rows;

    sections.push(buildInserts(table, processed));

    if (table in captured) {
      captured[table] = rows.map(r => String(r.id));
    }

    console.log(`✅  ${table.padEnd(30)} ${rows.length} rows`);
  }

  function inClause(ids: string[]): string {
    if (ids.length === 0) return 'FALSE';
    return ids.map(id => `'${id}'`).join(', ');
  }

  try {
    // 1. Tabelas raiz (sem FK para as demais)
    await dump('workers',      { hasPii: true });
    await dump('patients',     { hasPii: true, orderBy: 'id' });
    await dump('job_postings', { hasPii: true });

    const wIds = inClause(captured.workers);
    const jpIds = inClause(captured.job_postings);

    // 2. Tabelas dependentes — filtradas pelos IDs já capturados
    await dump('encuadres', {
      hasPii: true,
      where: `(worker_id IS NULL OR worker_id IN (${wIds}))
          AND (job_posting_id IS NULL OR job_posting_id IN (${jpIds}))`,
    });

    await dump('worker_job_applications', {
      where: `worker_id IN (${wIds}) AND job_posting_id IN (${jpIds})`,
    });

    await dump('blacklist', {
      hasPii: true,
      where: `worker_id IN (${wIds})`,
      orderBy: 'id',
    });

    await dump('worker_locations', {
      where: `worker_id IN (${wIds})`,
      orderBy: 'id',
    });

    // Escreve o arquivo
    if (!fs.existsSync(SEEDS_DIR)) fs.mkdirSync(SEEDS_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, sections.join('\n'), 'utf8');

    const sizeKb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
    console.log(`\n🌱  Snapshot salvo em: ${OUTPUT_FILE} (${sizeKb} KB)`);
    console.log(`    Execute \`make dev\` para subir o ambiente com esses dados.`);
  } finally {
    await prod.end();
  }
}

snapshot().catch(err => {
  console.error('Snapshot error:', err);
  process.exit(1);
});
