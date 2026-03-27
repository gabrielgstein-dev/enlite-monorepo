#!/usr/bin/env ts-node
/**
 * Script para importar TODOS os arquivos Excel da pasta docs/excel.
 * Processa um arquivo por vez (sequencialmente).
 *
 * Uso:
 *   npx ts-node scripts/import-all-excel.ts
 *   npx ts-node scripts/import-all-excel.ts --dry-run
 *   npx ts-node scripts/import-all-excel.ts --env=prod
 *
 * Opções:
 *   --dry-run    Simula a importação sem salvar no banco
 *   --env=prod   Usa variáveis de ambiente de produção
 */

// Carrega dotenv PRIMEIRO, antes de qualquer outro import
import { config } from 'dotenv';
config();

// DEBUG: Verifica se variáveis foram carregadas
console.log('[DEBUG] DB_HOST:', process.env.DB_HOST);
console.log('[DEBUG] DB_USER:', process.env.DB_USER);
console.log('[DEBUG] DB_NAME:', process.env.DB_NAME);

// Se não tem DATABASE_URL mas tem as variáveis individuais, constrói a URL
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
  console.log('[DEBUG] DATABASE_URL construída:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@'));
}

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PlanilhaImporter, ImportProgress } from '../src/infrastructure/scripts/import-planilhas';
import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';
import { ImportJobRepository } from '../src/infrastructure/repositories/OperationalRepositories';

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const envArg = args.find(a => a.startsWith('--env='));
const env = envArg ? envArg.split('=')[1] : 'local';
const skipUnrecognized = args.includes('--skip-unrecognized');

const EXCEL_DIR = path.join(__dirname, '..', 'docs', 'excel');

// Tipos de arquivos suportados
type FileType = 'ana_care' | 'candidatos' | 'planilla_operativa' | 'talent_search' | 'clickup' | 'unknown';

interface FileInfo {
  path: string;
  name: string;
  type: FileType;
  size: number;
}

function detectFileType(filePath: string): FileType {
  const fileName = path.basename(filePath).toLowerCase();

  // ClickUp: nome contém "clickup"
  if (fileName.includes('clickup')) return 'clickup';

  // Detecção por nome do arquivo
  if (fileName.includes('ana_care') || fileName.includes('anacare') || fileName.includes('ana care')) {
    return 'ana_care';
  }
  if (fileName.includes('candidatos')) {
    return 'candidatos';
  }
  if (fileName.includes('planilla') || fileName.includes('operativa') || fileName.includes('encuadre')) {
    return 'planilla_operativa';
  }

  // Detecção por conteúdo (para CSVs do Talent Search)
  if (fileName.endsWith('.csv')) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > 0) {
        const header = lines[0].toLowerCase();
        if (header.includes('pre screenings') && header.includes('numeros de telefono')) {
          return 'talent_search';
        }
      }
    } catch { /* ignora erro */ }
  }

  // Detecção por sheets / primeira célula (para arquivos xlsx)
  if (fileName.endsWith('.xlsx')) {
    try {
      const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: false });
      const sheetNames = workbook.SheetNames.map(n => n.toLowerCase());

      // ClickUp: primeira célula da primeira aba é "Task Type"
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (firstSheet) {
        const sample = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
        for (let i = 0; i < Math.min(sample.length, 5); i++) {
          const row = sample[i] as unknown[];
          if (row && String(row[0]).trim().toLowerCase() === 'task type') return 'clickup';
        }
      }

      if (sheetNames.some(n => n.includes('ana care') || n.includes('anacare'))) {
        return 'ana_care';
      }
      if (sheetNames.some(n => n.includes('talentum'))) {
        return 'candidatos';
      }
      if (sheetNames.some(n => n.includes('_base1') || n.includes('base1'))) {
        return 'planilla_operativa';
      }
    } catch { /* ignora erro */ }
  }

  return 'unknown';
}

function getTypeLabel(type: FileType): string {
  const labels: Record<FileType, string> = {
    'ana_care':          '🏥 Ana Care (workers ativos)',
    'candidatos':        '👥 Candidatos (Talentum)',
    'planilla_operativa':'📋 Planilla Operativa (casos/encuadres)',
    'talent_search':     '🔍 Talent Search (CSV)',
    'clickup':           '📌 ClickUp Export (vacantes/status)',
    'unknown':           '❓ Não reconhecido',
  };
  return labels[type];
}

async function findExcelFiles(): Promise<FileInfo[]> {
  const files = fs.readdirSync(EXCEL_DIR);
  const fileInfos: FileInfo[] = [];
  
  for (const file of files) {
    if (!file.endsWith('.xlsx') && !file.endsWith('.csv')) continue;
    if (file.startsWith('~') || file.startsWith('.')) continue;
    
    const filePath = path.join(EXCEL_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    
    const stats = fs.statSync(filePath);
    const type = detectFileType(filePath);
    
    fileInfos.push({
      path: filePath,
      name: file,
      type,
      size: stats.size,
    });
  }
  
  // Ordena: reconhecidos primeiro, depois por nome
  return fileInfos.sort((a, b) => {
    if (a.type === 'unknown' && b.type !== 'unknown') return 1;
    if (a.type !== 'unknown' && b.type === 'unknown') return -1;
    return a.name.localeCompare(b.name);
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

async function importSingleFile(
  fileInfo: FileInfo,
  importer: PlanilhaImporter,
  importJobRepo: ImportJobRepository,
  fileNumber: number,
  totalFiles: number
): Promise<{ success: boolean; summary: string; skipped?: boolean }> {
  const { path: filePath, name: fileName, type, size } = fileInfo;
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log();
  console.log('='.repeat(70));
  console.log(`📁 ARQUIVO ${fileNumber}/${totalFiles}: ${fileName}`);
  console.log('='.repeat(70));
  console.log(`   🏷️  Tipo detectado: ${getTypeLabel(type)}`);
  console.log(`   📊 Tamanho: ${(size / 1024).toFixed(1)} KB`);
  console.log(`   🔑 Hash: ${fileHash.slice(0, 16)}...`);
  console.log();

  // Pula arquivos não reconhecidos
  if (type === 'unknown') {
    console.log('   ⚠️  TIPO NÃO RECONHECIDO - Pulando arquivo');
    console.log('   💡 Use --skip-unrecognized para ignorar automaticamente');
    return { success: false, summary: `${fileName}: TIPO NÃO RECONHECIDO`, skipped: true };
  }

  const startTime = Date.now();

  try {
    // Cria job de importação
    let importJob;
    if (!dryRun) {
      importJob = await importJobRepo.create({
        filename: fileName,
        fileHash,
        createdBy: 'cli-import-all-script',
      });
      console.log(`   🆕 Job: ${importJob.id}`);
    } else {
      console.log(`   🆕 Job: dry-run-job-id`);
    }

    console.log('   🚀 Iniciando importação...');
    console.log();

    const results = await importer.importBuffer(
      fileBuffer,
      fileName,
      importJob?.id || 'dry-run-job-id',
      (progress: ImportProgress) => {
        console.log(`      📊 ${progress.sheet}: ${progress.processedRows}/${progress.totalRows} rows | ` +
                    `workers: +${progress.workersCreated}/~${progress.workersUpdated} | ` +
                    `errors: ${progress.errors.length}`);
      }
    );

    const duration = Date.now() - startTime;

    // Sumariza resultados
    const totals = {
      workersCreated: results.reduce((s, r) => s + r.workersCreated, 0),
      workersUpdated: results.reduce((s, r) => s + r.workersUpdated, 0),
      casesCreated: results.reduce((s, r) => s + r.casesCreated, 0),
      casesUpdated: results.reduce((s, r) => s + r.casesUpdated, 0),
      encuadresCreated: results.reduce((s, r) => s + r.encuadresCreated, 0),
      errors: results.flatMap(r => r.errors),
    };

    console.log();
    console.log(`   ✅ CONCLUÍDO em ${formatDuration(duration)}`);
    console.log(`      👤 Workers: +${totals.workersCreated}/~${totals.workersUpdated} | ` +
                `📋 Casos: +${totals.casesCreated}/~${totals.casesUpdated} | ` +
                `📝 Encuadres: +${totals.encuadresCreated} | ` +
                `❌ Erros: ${totals.errors.length}`);

    if (totals.errors.length > 0 && totals.errors.length <= 3) {
      totals.errors.slice(0, 3).forEach((err, i) => {
        console.log(`         ⚠️  Linha ${err.row}: ${err.error.slice(0, 60)}`);
      });
    }

    return {
      success: true,
      summary: `${fileName} (${type}): workers +${totals.workersCreated}/~${totals.workersUpdated}, cases +${totals.casesCreated}, errors ${totals.errors.length}`
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    console.log();
    console.log(`   ❌ FALHOU em ${formatDuration(duration)}`);
    console.error(`      Erro: ${(err as Error).message}`);

    return {
      success: false,
      summary: `${fileName}: FALHOU - ${(err as Error).message}`
    };
  }
}

async function main() {
  console.clear?.();
  console.log('╔'.padEnd(71, '═') + '╗');
  console.log('║' + ' IMPORTAÇÃO EM MASSA - TODOS OS ARQUIVOS EXCEL '.padStart(35).padEnd(69) + '  ║');
  console.log('╚'.padEnd(71, '═') + '╝');
  console.log();
  console.log(`📂 Diretório: ${EXCEL_DIR}`);
  console.log(`🔧 Ambiente: ${env.toUpperCase()}`);
  console.log(`📝 Modo: ${dryRun ? 'DRY RUN (simulação)' : 'REAL (salvará no banco)'}`);
  if (skipUnrecognized) {
    console.log(`⏭️  Opção: Ignorar arquivos não reconhecidos`);
  }
  console.log();

  // Verifica se diretório existe
  if (!fs.existsSync(EXCEL_DIR)) {
    console.error('❌ Erro: Diretório não encontrado:', EXCEL_DIR);
    process.exit(1);
  }

  // Lista arquivos
  const files = await findExcelFiles();
  if (files.length === 0) {
    console.error('❌ Erro: Nenhum arquivo .xlsx ou .csv encontrado em:', EXCEL_DIR);
    process.exit(1);
  }

  console.log(`📊 Encontrados ${files.length} arquivo(s):`);
  console.log();
  console.log('   TIPO DETECTADO              | ARQUIVO');
  console.log('   ' + '-'.repeat(66));
  files.forEach((f, i) => {
    const typeLabel = getTypeLabel(f.type).padEnd(27);
    console.log(`   ${typeLabel} | ${f.name}`);
  });
  console.log();

  // Separa reconhecidos e não reconhecidos
  const recognized = files.filter(f => f.type !== 'unknown');
  const unrecognized = files.filter(f => f.type === 'unknown');

  if (recognized.length === 0) {
    console.error('❌ Erro: Nenhum arquivo reconhecido encontrado!');
    console.error('   Arquivos suportados:');
    console.error('   - Ana Care Control.xlsx   (nome ou aba "Ana Care")');
    console.error('   - CANDIDATOS.xlsx          (nome ou aba "Talentum")');
    console.error('   - Planilla_Operativa.xlsx  (nome ou aba "_Base1")');
    console.error('   - export_YYYY-MM-DD.csv    (Talent Search — colunas específicas)');
    console.error('   - clickup_export.xlsx      (nome contém "clickup" ou 1ª célula = "Task Type")');
    process.exit(1);
  }

  // Conecta ao banco
  try {
    console.log('🔄 Conectando ao banco de dados...');
    const db = DatabaseConnection.getInstance();
    await db.getPool().query('SELECT 1');
    console.log('✅ Conexão estabelecida');
    console.log();
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', (err as Error).message);
    process.exit(1);
  }

  const importer = new PlanilhaImporter();
  const importJobRepo = new ImportJobRepository();

  // Confirmação
  if (!dryRun) {
    console.log('⛔ ALERTA: Esta operação modificará dados no banco de dados.');
    console.log(`   Arquivos reconhecidos: ${recognized.length}`);
    if (unrecognized.length > 0 && !skipUnrecognized) {
      console.log(`   Arquivos NÃO reconhecidos: ${unrecognized.length} (serão pulados)`);
    }
    console.log('   Digite "IMPORTAR-TODOS" para continuar:');
    
    const confirm = await new Promise<string>((resolve) => {
      process.stdin.once('data', (data) => resolve(data.toString().trim()));
    });

    if (confirm !== 'IMPORTAR-TODOS') {
      console.log();
      console.log('❌ Confirmação incorreta. Operação cancelada.');
      process.exit(0);
    }
    console.log();
  }

  // Processa arquivos um por vez
  const filesToProcess = skipUnrecognized ? recognized : files;
  
  console.log('🚀 INICIANDO IMPORTAÇÃO SEQUENCIAL...');
  console.log(`   Processando ${filesToProcess.length} arquivo(s)...`);
  console.log('='.repeat(70));

  const startTime = Date.now();
  const results: { success: boolean; summary: string; skipped?: boolean }[] = [];

  for (let i = 0; i < filesToProcess.length; i++) {
    const result = await importSingleFile(
      filesToProcess[i],
      importer,
      importJobRepo,
      i + 1,
      filesToProcess.length
    );
    results.push(result);
    
    // Pausa entre arquivos para não sobrecarregar
    if (i < filesToProcess.length - 1) {
      console.log();
      console.log('   ⏳ Pausa de 1s antes do próximo arquivo...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const totalDuration = Date.now() - startTime;

  // Resumo final
  console.log();
  console.log('='.repeat(70));
  console.log('📊 RESUMO FINAL');
  console.log('='.repeat(70));
  console.log();
  console.log(`⏱️  Duração total: ${formatDuration(totalDuration)}`);
  console.log(`📁 Arquivos processados: ${filesToProcess.length}`);
  console.log(`✅ Sucessos: ${results.filter(r => r.success).length}`);
  console.log(`❌ Falhas: ${results.filter(r => !r.success && !r.skipped).length}`);
  console.log(`⏭️  Pulados: ${results.filter(r => r.skipped).length}`);
  console.log();
  console.log('DETALHES:');
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : (r.skipped ? '⏭️' : '❌');
    console.log(`   ${icon} ${r.summary}`);
  });
  console.log();
  console.log('='.repeat(70));

  if (dryRun) {
    console.log('📝 MODO DRY-RUN: Nenhuma alteração foi feita no banco');
  } else {
    console.log('✅ Importação concluída!');
  }
  console.log('='.repeat(70));

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
