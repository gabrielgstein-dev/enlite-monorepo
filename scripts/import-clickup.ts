#!/usr/bin/env ts-node
/**
 * Script para importar APENAS o export do ClickUp para job_postings.
 *
 * Uso:
 *   npm run import:clickup              → busca em docs/excel/ arquivo com "clickup" no nome
 *   npm run import:clickup:prod         → mesmo, apontando para banco de produção
 *   npm run import:clickup -- --file=caminho/para/arquivo.xlsx
 *
 * O arquivo é detectado automaticamente por:
 *   1. Nome contém "clickup" (case-insensitive)
 *   2. Primeira célula da primeira aba é "Task Type"
 */

import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PlanilhaImporter } from '../src/infrastructure/scripts/import-planilhas';
import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';
import { ImportJobRepository } from '../src/infrastructure/repositories/OperationalRepositories';

const args     = process.argv.slice(2);
const dryRun   = args.includes('--dry-run');
const fileArg  = args.find(a => a.startsWith('--file='));
const EXCEL_DIR = path.join(__dirname, '..', 'docs', 'excel');

function isClickUpFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes('clickup')) return true;

  if (name.endsWith('.xlsx')) {
    try {
      const wb = XLSX.readFile(filePath, { type: 'file', cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return false;
      const sample = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      for (let i = 0; i < Math.min(sample.length, 5); i++) {
        const row = sample[i] as unknown[];
        if (row && String(row[0]).trim().toLowerCase() === 'task type') return true;
      }
    } catch { /* ignora */ }
  }
  return false;
}

function findClickUpFile(): string | null {
  if (!fs.existsSync(EXCEL_DIR)) return null;
  const files = fs.readdirSync(EXCEL_DIR)
    .filter(f => !f.startsWith('~') && !f.startsWith('.'))
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'))
    .map(f => path.join(EXCEL_DIR, f))
    .filter(isClickUpFile);

  return files[0] ?? null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

async function main() {
  console.log('╔'.padEnd(71, '═') + '╗');
  console.log('║' + ' IMPORTAÇÃO CLICKUP → job_postings '.padStart(35).padEnd(69) + '  ║');
  console.log('╚'.padEnd(71, '═') + '╝');
  console.log();
  console.log(`📝 Modo: ${dryRun ? 'DRY RUN (simulação)' : 'REAL (salvará no banco)'}`);
  console.log();

  // Resolve arquivo
  let filePath: string;
  if (fileArg) {
    filePath = path.resolve(fileArg.split('=')[1]);
  } else {
    const found = findClickUpFile();
    if (!found) {
      console.error('❌ Nenhum arquivo ClickUp encontrado em:', EXCEL_DIR);
      console.error('   Nomeie o arquivo com "clickup" ou garanta que a 1ª célula seja "Task Type".');
      console.error('   Ou use: npm run import:clickup -- --file=caminho/arquivo.xlsx');
      process.exit(1);
    }
    filePath = found;
  }

  if (!fs.existsSync(filePath)) {
    console.error('❌ Arquivo não encontrado:', filePath);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fileSize = fs.statSync(filePath).size;

  console.log('='.repeat(70));
  console.log(`📁 Arquivo : ${fileName}`);
  console.log(`📊 Tamanho : ${(fileSize / 1024).toFixed(1)} KB`);
  console.log(`🔑 Hash    : ${fileHash.slice(0, 16)}...`);
  console.log('='.repeat(70));
  console.log();

  // Conecta ao banco
  try {
    await DatabaseConnection.getInstance().getPool().query('SELECT 1');
    console.log('✅ Banco conectado');
    console.log();
  } catch (err) {
    console.error('❌ Falha na conexão com o banco:', (err as Error).message);
    process.exit(1);
  }

  // Confirmação antes de gravar
  if (!dryRun) {
    console.log('⛔ Esta operação vai INCREMENTAR job_postings com dados do ClickUp.');
    console.log('   Vacantes existentes: campos ClickUp serão atualizados.');
    console.log('   Vacantes novas: serão criadas com os dados do ClickUp.');
    console.log('   Digite "IMPORTAR-CLICKUP" para continuar:');

    const confirm = await new Promise<string>((resolve) => {
      process.stdin.once('data', d => resolve(d.toString().trim()));
    });

    if (confirm !== 'IMPORTAR-CLICKUP') {
      console.log('\n❌ Confirmação incorreta. Operação cancelada.');
      process.exit(0);
    }
    console.log();
  }

  const importJobRepo = new ImportJobRepository();
  const importer      = new PlanilhaImporter();

  let importJob: { id: string } | null = null;
  if (!dryRun) {
    const pool = DatabaseConnection.getInstance().getPool();

    // O índice idx_import_jobs_file_hash é ÚNICO PARCIAL: UNIQUE(file_hash) WHERE status='done'.
    // Se um job anterior com o mesmo hash estiver 'done', o import atual não pode ser marcado
    // como 'done' ao final. Por isso, resetamos todos os jobs anteriores desse hash para 'error'
    // antes de criar um novo job limpo.
    await pool.query(
      "UPDATE import_jobs SET status = 'error' WHERE file_hash = $1",
      [fileHash]
    );

    importJob = await importJobRepo.create({
      filename: fileName,
      fileHash,
      createdBy: 'cli-import-clickup',
    });
    console.log(`🆕 Job criado: ${importJob.id}`);
  }

  const startTime = Date.now();

  try {
    const results = await importer.importBuffer(
      fileBuffer,
      fileName,
      importJob?.id ?? 'dry-run-job-id',
      (progress) => {
        console.log(
          `   📌 ${progress.sheet}: ${progress.processedRows}/${progress.totalRows} rows | ` +
          `vacantes: +${progress.casesCreated}/~${progress.casesUpdated} | ` +
          `erros: ${progress.errors.length}`
        );
      }
    );

    const duration = Date.now() - startTime;
    const totals = {
      casesCreated:  results.reduce((s, r) => s + r.casesCreated,  0),
      casesUpdated:  results.reduce((s, r) => s + r.casesUpdated,  0),
      errors:        results.flatMap(r => r.errors),
    };

    console.log();
    console.log('='.repeat(70));
    console.log(`✅ CONCLUÍDO em ${formatDuration(duration)}`);
    console.log(`   📌 Vacantes criadas  : +${totals.casesCreated}`);
    console.log(`   📌 Vacantes atualizadas: ~${totals.casesUpdated}`);
    console.log(`   ❌ Erros             : ${totals.errors.length}`);

    if (totals.errors.length > 0) {
      console.log();
      console.log('   Primeiros erros:');
      totals.errors.slice(0, 5).forEach(e => {
        console.log(`     Linha ${e.row}: ${e.error.slice(0, 80)}`);
      });
    }

    console.log('='.repeat(70));

    if (dryRun) console.log('📝 MODO DRY-RUN: nenhuma alteração foi feita no banco.');

  } catch (err) {
    console.error('\n❌ FALHOU:', (err as Error).message);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
