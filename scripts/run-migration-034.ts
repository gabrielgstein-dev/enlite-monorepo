#!/usr/bin/env ts-node
/**
 * Script para rodar a migration 034 (worker_locations)
 */

import { config } from 'dotenv';
import * as path from 'path';

// Carrega .env do diretório raiz
const envPath = path.join(__dirname, '..', '.env');
config({ path: envPath });

// Debug
console.log('[DEBUG] DB_HOST:', process.env.DB_HOST);
console.log('[DEBUG] DB_NAME:', process.env.DB_NAME);

// Constrói DATABASE_URL se necessário
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import * as fs from 'fs';
import { DatabaseConnection } from '../src/infrastructure/database/DatabaseConnection';

async function runMigration() {
  console.log('🔄 Executando migration 034_create_worker_locations.sql...');
  
  try {
    const db = DatabaseConnection.getInstance();
    const pool = db.getPool();
    
    // Lê o arquivo SQL
    const migrationPath = path.join(__dirname, '..', 'migrations', '034_create_worker_locations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Migration carregada:', migrationPath);
    console.log('🚀 Executando...');
    
    // Executa a migration
    await pool.query(sql);
    
    console.log('✅ Migration 034 executada com sucesso!');
    console.log('📊 Tabela worker_locations criada');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro ao executar migration:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
