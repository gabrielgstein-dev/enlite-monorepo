#!/usr/bin/env ts-node
/**
 * Script para testar o import dos arquivos xlsx
 * Uso: npx ts-node scripts/test-import.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PlanilhaImporter, ImportProgress } from '../src/infrastructure/scripts/import-planilhas';
import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

async function main() {
  console.log('🚀 Iniciando teste de import...\n');

  const importer = new PlanilhaImporter();
  const excelDir = path.join(__dirname, '../docs/excel');

  // Verificar arquivos disponíveis
  const files = fs.readdirSync(excelDir).filter(f => 
    f.endsWith('.xlsx') || f.endsWith('.csv')
  );

  console.log('📁 Arquivos encontrados:', files);
  console.log('');

  // Importar cada arquivo
  for (const file of files) {
    const filePath = path.join(excelDir, file);
    console.log(`\n📄 Importando: ${file}`);
    console.log('='.repeat(60));

    try {
      const buffer = fs.readFileSync(filePath);
      const jobId = randomUUID();
      
      const results = await importer.importBuffer(buffer, file, jobId, (progress: ImportProgress) => {
        console.log(`  [${progress.sheet}] ${progress.processedRows}/${progress.totalRows} rows | ` +
          `Workers: +${progress.workersCreated} ~${progress.workersUpdated} | ` +
          `Cases: +${progress.casesCreated} ~${progress.casesUpdated} | ` +
          `Apps: +${progress.encuadresCreated} | ` +
          `Errors: ${progress.errors.length}`
        );
      });

      console.log('\n✅ Resultado final:');
      results.forEach((r: ImportProgress) => {
        console.log(`  [${r.sheet}]`);
        console.log(`    Workers: +${r.workersCreated} ~${r.workersUpdated}`);
        console.log(`    Cases: +${r.casesCreated} ~${r.casesUpdated}`);
        console.log(`    Applications: +${r.encuadresCreated} (skipped: ${r.encuadresSkipped})`);
        if (r.errors.length > 0) {
          console.log(`    ⚠️  Errors: ${r.errors.length}`);
          r.errors.slice(0, 5).forEach((e: { row: number; error: string }) => {
            console.log(`      Row ${e.row}: ${e.error}`);
          });
          if (r.errors.length > 5) {
            console.log(`      ... e mais ${r.errors.length - 5} erros`);
          }
        }
      });

    } catch (err) {
      console.error(`❌ Erro ao importar ${file}:`, (err as Error).message);
      console.error((err as Error).stack);
    }
  }

  console.log('\n\n🔍 Verificando dados no banco...\n');

  const pool = DatabaseConnection.getInstance().getPool();

  // Contar workers
  const workersResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE profession IS NOT NULL) as with_profession,
      COUNT(*) FILTER (WHERE occupation IS NOT NULL) as with_occupation,
      COUNT(*) FILTER (WHERE funnel_stage = 'QUALIFIED') as qualified
    FROM workers
  `);
  console.log('👥 Workers:', workersResult.rows[0]);

  // Contar casos
  const casesResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE patient_name IS NOT NULL) as with_patient_name
    FROM job_postings
    WHERE case_number IS NOT NULL
  `);
  console.log('📋 Casos:', casesResult.rows[0]);

  // Contar applications
  const appsResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT worker_id) as unique_workers,
      COUNT(DISTINCT job_posting_id) as unique_cases
    FROM worker_job_applications
  `);
  console.log('🔗 Applications:', appsResult.rows[0]);

  // Sample de workers com profession
  const sampleWorkers = await pool.query(`
    SELECT 
      id,
      phone,
      email,
      occupation,
      profession,
      funnel_stage
    FROM workers
    WHERE profession IS NOT NULL
    LIMIT 5
  `);
  console.log('\n📊 Sample de workers com profession:');
  sampleWorkers.rows.forEach(w => {
    console.log(`  ${w.phone} | ${w.occupation} | ${w.profession} | ${w.funnel_stage}`);
  });

  // Sample de applications
  const sampleApps = await pool.query(`
    SELECT 
      w.phone,
      w.occupation,
      jp.case_number,
      wja.created_at
    FROM worker_job_applications wja
    JOIN workers w ON w.id = wja.worker_id
    JOIN job_postings jp ON jp.id = wja.job_posting_id
    ORDER BY wja.created_at DESC
    LIMIT 10
  `);
  console.log('\n🔗 Sample de applications (últimas 10):');
  sampleApps.rows.forEach(a => {
    console.log(`  ${a.phone} → CASO ${a.case_number}`);
  });

  console.log('\n✅ Teste concluído!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
