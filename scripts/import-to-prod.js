#!/usr/bin/env node
/**
 * Script de importação para PRODUÇÃO.
 * 
 * ⚠️  ATENÇÃO: Este script conecta ao banco de PRODUÇÃO!
 * 
 * Pré-requisitos:
 *   1. Arquivo .env.production com credenciais de produção
 *   2. Acesso VPN/Cloud SQL Proxy ativo
 *   3. Backup do banco recomendado antes de importar
 * 
 * Uso:
 *   node scripts/import-to-prod.js <arquivo-excel>
 * 
 * Exemplo:
 *   node scripts/import-to-prod.js ../docs/excel/CANDIDATOS.xlsx
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('❌ Erro: Caminho do arquivo não fornecido');
  console.error('Uso: node scripts/import-to-prod.js <arquivo-excel>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ Erro: Arquivo não encontrado: ${filePath}`);
  process.exit(1);
}

// Verifica se .env.production existe
const envPath = path.join(__dirname, '..', '.env.production');
if (!fs.existsSync(envPath)) {
  console.error('❌ Erro: Arquivo .env.production não encontrado');
  console.error('   Crie o arquivo com as credenciais de produção');
  process.exit(1);
}

console.log('='.repeat(70));
console.log('⚠️  MODO PRODUÇÃO - IMPORTAÇÃO DE DADOS');
console.log('='.repeat(70));
console.log();
console.log(`📁 Arquivo: ${path.basename(filePath)}`);
console.log(`🔌 Banco: PRODUÇÃO`);
console.log();
console.log('⛔ ALERTAS:');
console.log('   - Este script modificará dados em PRODUÇÃO');
console.log('   - Workers, casos e encuadres serão criados/atualizados');
console.log('   - A operação não pode ser desfeita automaticamente');
console.log();

// Confirmação manual
console.log('📝 Para prosseguir, digite "IMPORTAR-PROD" e pressione Enter:');
process.stdin.once('data', (data) => {
  const confirm = data.toString().trim();
  
  if (confirm !== 'IMPORTAR-PROD') {
    console.log();
    console.log('❌ Confirmação incorreta. Operação cancelada.');
    process.exit(0);
  }

  console.log();
  console.log('🚀 Iniciando importação em produção...');
  console.log();

  try {
    // Usa ts-node diretamente com as variáveis de ambiente de produção
    const cmd = `cross-env NODE_ENV=production DOTENV_CONFIG_PATH=.env.production npx ts-node -r dotenv/config scripts/import-excel-cli.ts --env=prod "${filePath}"`;
    
    execSync(cmd, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
      }
    });
  } catch (err) {
    console.error();
    console.error('❌ Erro durante importação:', err);
    process.exit(1);
  }
});
