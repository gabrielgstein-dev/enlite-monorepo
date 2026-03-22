/**
 * Script de debug para testar imports localmente
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '../.env.test') });

import { PlanilhaImporter } from '../src/infrastructure/scripts/import-planilhas';

async function testImport() {
  console.log('=== INICIANDO TESTE DE IMPORT ===\n');

  const importer = new PlanilhaImporter();
  
  // Arquivos para testar
  const files = [
    {
      name: 'Ana Care Control.xlsx',
      path: path.join(__dirname, '../docs/excel/Ana Care Control.xlsx'),
    },
    {
      name: 'CANDIDATOS.xlsx',
      path: path.join(__dirname, '../docs/excel/CANDIDATOS.xlsx'),
    },
    {
      name: 'export_2026-03-20.csv',
      path: path.join(__dirname, '../docs/excel/export_2026-03-20.csv'),
    },
  ];

  for (const file of files) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TESTANDO: ${file.name}`);
    console.log('='.repeat(60));

    try {
      // Verificar se arquivo existe
      if (!fs.existsSync(file.path)) {
        console.error(`❌ Arquivo não encontrado: ${file.path}`);
        continue;
      }

      const buffer = fs.readFileSync(file.path);
      console.log(`✅ Arquivo lido: ${buffer.length} bytes`);

      // Criar job ID fake
      const jobId = `test-${Date.now()}`;
      console.log(`📋 Job ID: ${jobId}`);

      // Callback de progresso
      const onProgress = (progress: any) => {
        console.log(`\n📊 PROGRESSO:`);
        console.log(`  - Processadas: ${progress.processedRows}`);
        console.log(`  - Criadas: ${progress.workersCreated}`);
        console.log(`  - Atualizadas: ${progress.workersUpdated}`);
        console.log(`  - Erros: ${progress.errors.length}`);
        if (progress.errors.length > 0) {
          console.log(`  - Últimos erros:`, progress.errors.slice(-3));
        }
      };

      console.log(`\n🚀 Iniciando import...`);
      const startTime = Date.now();

      const results = await importer.importBuffer(
        buffer,
        file.name,
        jobId,
        onProgress
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n✅ IMPORT CONCLUÍDO em ${duration}s`);
      console.log(`📊 RESULTADO FINAL (${results.length} sheets):`);
      
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalProcessed = 0;
      let totalErrors = 0;

      results.forEach((result, idx) => {
        console.log(`\n  Sheet ${idx + 1}:`);
        console.log(`    - Workers criados: ${result.workersCreated}`);
        console.log(`    - Workers atualizados: ${result.workersUpdated}`);
        console.log(`    - Rows processadas: ${result.processedRows}`);
        console.log(`    - Erros: ${result.errors.length}`);
        
        totalCreated += result.workersCreated;
        totalUpdated += result.workersUpdated;
        totalProcessed += result.processedRows;
        totalErrors += result.errors.length;

        if (result.errors.length > 0) {
          console.log(`    ❌ Primeiros erros:`);
          result.errors.slice(0, 5).forEach((err: any) => {
            console.log(`      - Row ${err.row}: ${err.error}`);
          });
        }
      });

      console.log(`\n📈 TOTAIS:`);
      console.log(`  - Workers criados: ${totalCreated}`);
      console.log(`  - Workers atualizados: ${totalUpdated}`);
      console.log(`  - Rows processadas: ${totalProcessed}`);
      console.log(`  - Erros: ${totalErrors}`);

    } catch (error) {
      console.error(`\n❌ ERRO FATAL:`, error);
      if (error instanceof Error) {
        console.error(`Stack: ${error.stack}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('TESTE CONCLUÍDO');
  console.log('='.repeat(60));
  
  process.exit(0);
}

// Executar
testImport().catch(err => {
  console.error('ERRO NÃO TRATADO:', err);
  process.exit(1);
});
