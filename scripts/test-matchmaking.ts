#!/usr/bin/env ts-node
import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import { MatchmakingService } from '../src/infrastructure/services/MatchmakingService';

const JOB_ID = process.argv[2] ?? '9fc6c87e-71c8-4bae-9717-c52641669a84'; // Caso 182 default
const TOP_N  = parseInt(process.argv[3] ?? '5');

async function main() {
  const svc = new MatchmakingService();

  console.log(`\n🎯 Matchmaking para job_posting ${JOB_ID} (top ${TOP_N})...\n`);
  const result = await svc.matchWorkersForJob(JOB_ID, TOP_N);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Resumo:`);
  console.log(`  Hard filter:  ${result.matchSummary.hardFilteredCount} candidatos passaram`);
  console.log(`  LLM scored:   ${result.matchSummary.llmScoredCount}`);
  console.log(`  Job enriched: ${result.jobEnriched}`);
  console.log(`${'='.repeat(60)}\n`);

  result.candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.workerName} | ${c.occupation ?? 'sem ocupação'} | zona: ${c.workZone ?? 'sem zona'}`);
    console.log(`     Scores → structured: ${c.structuredScore} | llm: ${c.llmScore ?? 'N/A'} | final: ${c.finalScore}`);
    if (c.llmReasoning) console.log(`     💬 ${c.llmReasoning.slice(0, 150)}`);
    if (c.llmStrengths.length) console.log(`     ✅ ${c.llmStrengths.join(' | ')}`);
    if (c.llmRedFlags.length) console.log(`     ⚠️  ${c.llmRedFlags.join(' | ')}`);
    if (c.alreadyApplied) console.log(`     📋 Já tem candidatura registrada`);
    console.log();
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
