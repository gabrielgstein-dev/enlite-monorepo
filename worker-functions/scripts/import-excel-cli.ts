#!/usr/bin/env ts-node
/**
 * Script CLI para importar arquivos Excel diretamente no banco de dados.
 *
 * Uso:
 *   npx ts-node scripts/import-excel-cli.ts <caminho-do-arquivo>
 *   npx ts-node scripts/import-excel-cli.ts --dry-run <caminho-do-arquivo>
 *   npx ts-node scripts/import-excel-cli.ts --env=prod <caminho-do-arquivo>
 *
 * Exemplos:
 *   npx ts-node scripts/import-excel-cli.ts docs/excel/Ana\ Care\ Control.xlsx
 *   npx ts-node scripts/import-excel-cli.ts docs/excel/CANDIDATOS.xlsx
 *   npx ts-node scripts/import-excel-cli.ts docs/excel/export_2026-03-20.csv
 */

import { config } from 'dotenv';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Parse CLI arguments early (needed for env file selection)
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const envArg = args.find(a => a.startsWith('--env='));
const env = envArg ? envArg.split('=')[1] : 'local';
const filePath = args.find(a => !a.startsWith('--') && a.length > 0);

// Load the right .env file based on --env flag
if (env === 'prod') {
  config({ path: path.resolve(__dirname, '..', '.env.prod') });

  // Fetch DB password from Secret Manager if not set
  if (!process.env.DB_PASSWORD) {
    try {
      const password = execSync(
        'gcloud secrets versions access latest --secret="enlite-ar-db-password"',
        { encoding: 'utf-8' }
      ).trim();
      process.env.DB_PASSWORD = password;
    } catch {
      console.error('❌ Erro ao buscar senha no Secret Manager. Verifique gcloud auth.');
      process.exit(1);
    }
  }
} else {
  config(); // loads .env
}

// Constrói DATABASE_URL a partir das variáveis individuais se necessário
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import { PlanilhaImporter, ImportProgress } from '../src/infrastructure/scripts/import-planilhas';
import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';

function printUsage() {
  console.log(`
Uso: npx ts-node scripts/import-excel-cli.ts [opções] <arquivo>

Opções:
  --dry-run      Simula a importação sem salvar no banco
  --env=prod     Usa variáveis de ambiente de produção (requer .env.prod)
  --env=local    Usa variáveis de ambiente locais (padrão)

Exemplos:
  npx ts-node scripts/import-excel-cli.ts docs/excel/Ana\ Care\ Control.xlsx
  npx ts-node scripts/import-excel-cli.ts --dry-run docs/excel/CANDIDATOS.xlsx
  npx ts-node scripts/import-excel-cli.ts --env=prod docs/excel/export_2026-03-20.csv
`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('IMPORTAÇÃO DE EXCEL PARA BANCO DE DADOS');
  console.log('='.repeat(60));
  console.log(`Ambiente: ${env.toUpperCase()}`);
  console.log(`Modo: ${dryRun ? 'DRY RUN (simulação)' : 'REAL (salvará no banco)'}`);
  console.log();

  if (!filePath) {
    console.error('❌ Erro: Caminho do arquivo não fornecido');
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Erro: Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`📁 Arquivo: ${fileName}`);
  console.log(`📊 Tamanho: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`🔑 Hash: ${fileHash.slice(0, 16)}...`);
  console.log();

  if (dryRun) {
    console.log('🔍 MODO DRY-RUN: Nenhuma alteração será feita no banco');
    console.log();
  }

  // Inicializa conexão com banco
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const parsed = new URL(dbUrl);
      console.log(`🔄 Conectando ao banco: ${parsed.host}${parsed.pathname}`);
    } else {
      console.log('🔄 Conectando ao banco (sem DATABASE_URL)...');
    }
    const db = DatabaseConnection.getInstance();
    await db.getPool().query('SELECT 1');
    console.log('✅ Conexão estabelecida');
    console.log();
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', (err as Error).message);
    if (env === 'prod') {
      console.error('   Verifique se o Cloud SQL Proxy está rodando:');
      console.error('   cloud-sql-proxy --port 5435 enlite-prd:southamerica-west1:enlite-ar-db &');
    }
    process.exit(1);
  }

  const importer = new PlanilhaImporter();

  // Cria job de importação
  const { ImportJobRepository } = await import('../src/infrastructure/repositories/OperationalRepositories');
  const importJobRepo = new ImportJobRepository();

  let importJob;
  if (!dryRun) {
    importJob = await importJobRepo.create({
      filename: fileName,
      fileHash,
      createdBy: 'cli-import-script',
    });
    console.log(`🆕 Job criado: ${importJob.id}`);
  } else {
    // Dry-run ainda precisa de um job real pois importBuffer faz updateStatus com o ID
    importJob = await importJobRepo.create({
      filename: `[DRY-RUN] ${fileName}`,
      fileHash,
      createdBy: 'cli-import-script-dry-run',
    });
    console.log(`🆕 Job (dry-run): ${importJob.id}`);
  }

  console.log();
  console.log('🚀 Iniciando importação...');
  console.log('-'.repeat(60));

  try {
    const results = await importer.importBuffer(
      fileBuffer,
      fileName,
      importJob!.id,
      (progress: ImportProgress) => {
        console.log(`  📊 ${progress.sheet}: ${progress.processedRows}/${progress.totalRows} rows | ` +
                    `workers: +${progress.workersCreated}/~${progress.workersUpdated} | ` +
                    `errors: ${progress.errors.length}`);
      }
    );

    console.log('-'.repeat(60));
    console.log('✅ Importação concluída!');
    console.log();

    // Sumariza resultados
    const totals = {
      workersCreated: results.reduce((s, r) => s + r.workersCreated, 0),
      workersUpdated: results.reduce((s, r) => s + r.workersUpdated, 0),
      casesCreated: results.reduce((s, r) => s + r.casesCreated, 0),
      casesUpdated: results.reduce((s, r) => s + r.casesUpdated, 0),
      encuadresCreated: results.reduce((s, r) => s + r.encuadresCreated, 0),
      encuadresSkipped: results.reduce((s, r) => s + r.encuadresSkipped, 0),
      errors: results.flatMap(r => r.errors),
    };

    console.log('📈 RESUMO:');
    console.log(`  👤 Workers criados: ${totals.workersCreated}`);
    console.log(`  👤 Workers atualizados: ${totals.workersUpdated}`);
    console.log(`  📋 Casos criados: ${totals.casesCreated}`);
    console.log(`  📋 Casos atualizados: ${totals.casesUpdated}`);
    console.log(`  📝 Encuadres criados: ${totals.encuadresCreated}`);
    console.log(`  📝 Encuadres ignorados: ${totals.encuadresSkipped}`);
    console.log(`  ❌ Erros: ${totals.errors.length}`);

    if (totals.errors.length > 0) {
      console.log();
      console.log('⚠️  PRIMEIROS ERROS:');
      totals.errors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. Linha ${err.row}: ${err.error}`);
      });
    }

    console.log();
    console.log('='.repeat(60));
    if (dryRun) {
      console.log('📝 MODO DRY-RUN: Nenhuma alteração foi feita');
    } else {
      console.log(`✅ Dados importados com sucesso!`);
      console.log(`🆔 Job ID: ${importJob?.id}`);
    }
    console.log('='.repeat(60));

    process.exit(0);
  } catch (err) {
    console.error();
    console.error('❌ ERRO FATAL durante importação:');
    console.error((err as Error).message);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

main();
