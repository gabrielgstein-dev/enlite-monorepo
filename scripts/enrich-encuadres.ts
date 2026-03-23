#!/usr/bin/env ts-node
/**
 * Enriquece em bulk todos os encuadres pendentes com LLM (Groq).
 * Popula llm_availability_notes, llm_follow_up_potential, llm_interest_level, etc.
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/enrich-encuadres.ts
 *   npx ts-node -r dotenv/config scripts/enrich-encuadres.ts --batch-size=20
 *   npx ts-node -r dotenv/config scripts/enrich-encuadres.ts --max=500      (processa no máximo N)
 */

import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import { LLMEnrichmentService } from '../src/infrastructure/services/LLMEnrichmentService';

const args = process.argv.slice(2);
const batchArg = args.find(a => a.startsWith('--batch-size='));
const maxArg   = args.find(a => a.startsWith('--max='));
const batchSize = batchArg ? parseInt(batchArg.split('=')[1]) : 25;
const maxTotal  = maxArg  ? parseInt(maxArg.split('=')[1])   : null;

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY não configurada no .env');
    process.exit(1);
  }

  console.log(`\n🤖 Enriquecendo encuadres com LLM`);
  console.log(`   Batch size: ${batchSize}${maxTotal ? ` | Máximo: ${maxTotal}` : ' | Sem limite (todos os pendentes)'}`)
  console.log(`   Rate limit: ~25 req/min (Groq free tier)\n`);

  const svc = new LLMEnrichmentService();
  const { processed, errors } = await svc.enrichPending(batchSize);

  console.log(`\n📊 Resultado: ${processed} enriquecidos | ${errors} erros`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
