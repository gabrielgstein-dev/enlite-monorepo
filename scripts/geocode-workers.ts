#!/usr/bin/env ts-node
/**
 * Geocodifica os endereços de worker_locations.
 *
 * Prioridade de fonte:
 *   1. address (endereço completo)
 *   2. work_zone + ", Buenos Aires, Argentina" (fallback para texto de zona)
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/geocode-workers.ts
 *   npx ts-node -r dotenv/config scripts/geocode-workers.ts --all     (reprocessa já geocodificados)
 *   npx ts-node -r dotenv/config scripts/geocode-workers.ts --dry-run
 *   npx ts-node -r dotenv/config scripts/geocode-workers.ts --limit=100
 */

import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

import { Pool } from 'pg';
import { GeocodingService } from '../src/infrastructure/services/GeocodingService';

const args     = process.argv.slice(2);
const dryRun   = args.includes('--dry-run');
const rerunAll = args.includes('--all');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit    = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const DELAY_MS = 220; // respeita rate limit Google Maps (50 req/s)

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
}

async function main() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY não configurada no .env');
    process.exit(1);
  }

  const pool = getPool();
  const geo  = new GeocodingService();

  const whereClause = rerunAll
    ? `WHERE (address IS NOT NULL OR work_zone IS NOT NULL)`
    : `WHERE (address IS NOT NULL OR work_zone IS NOT NULL) AND lat IS NULL`;

  const limitClause = limit ? `LIMIT ${limit}` : '';

  const { rows } = await pool.query<{
    id: string;
    worker_id: string;
    address: string | null;
    work_zone: string | null;
  }>(`SELECT id, worker_id, address, work_zone
      FROM worker_locations
      ${whereClause}
      ORDER BY id
      ${limitClause}`);

  const total = rows.length;
  console.log(`\n🌍 Geocoding worker_locations`);
  console.log(`   Modo: ${dryRun ? 'DRY RUN' : 'REAL'} | Registros: ${total}${limit ? ` (limite: ${limit})` : ''}\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    // Prioridade: address completo > work_zone como fallback
    let query: string;
    let source: string;

    if (row.address?.trim()) {
      query  = row.address.trim();
      source = 'address';
    } else if (row.work_zone?.trim()) {
      query  = `${row.work_zone.trim()}, Buenos Aires, Argentina`;
      source = 'work_zone';
    } else {
      skipped++;
      continue;
    }

    const result = await geo.geocode(query, 'AR');

    if (!result) {
      process.stdout.write(`  ⚠  sem resultado: "${query.substring(0, 60)}"\n`);
      failed++;
    } else {
      process.stdout.write(`  ✅ [${source}] → ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)} | "${query.substring(0, 50)}"\n`);

      if (!dryRun) {
        await pool.query(
          `UPDATE worker_locations SET lat = $1, lng = $2 WHERE id = $3`,
          [result.latitude, result.longitude, row.id]
        );
      }
      ok++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n📊 Resultado: ${ok} geocodificados | ${failed} sem resultado | ${skipped} ignorados`);
  if (dryRun) console.log('   (dry-run: nenhuma alteração salva)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
