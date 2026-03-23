#!/usr/bin/env ts-node
/**
 * Geocodifica os endereços de atendimento de job_postings.
 *
 * Para cada vaga com service_address_formatted (ou service_address_raw como fallback)
 * e sem service_lat/service_lng, chama a Google Maps Geocoding API e persiste o resultado.
 *
 * Uso:
 *   pnpm geocode:jobs              → processa todas as vagas sem lat/lng
 *   pnpm geocode:jobs -- --all     → reprocessa todas (inclusive as já geocodificadas)
 *   pnpm geocode:jobs -- --dry-run → simula sem salvar
 *   pnpm geocode:jobs -- --limit=50
 */

import { config } from 'dotenv';
config();

import { Pool } from 'pg';
import { GeocodingService } from '../src/infrastructure/services/GeocodingService';

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const rerunAll = args.includes('--all');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit   = limitArg ? parseInt(limitArg.split('=')[1]) : null;

const DELAY_MS = 200; // respeita rate limit da API (50 req/s free tier)

function getPool(): Pool {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  }
  return new Pool({
    host:     process.env.DB_HOST,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port:     parseInt(process.env.DB_PORT ?? '5432'),
    ssl:      false,
  });
}

async function main() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY não configurada no .env');
    process.exit(1);
  }

  const pool = getPool();
  const geo  = new GeocodingService();

  const whereClause = rerunAll
    ? `WHERE (service_address_formatted IS NOT NULL OR service_address_raw IS NOT NULL)`
    : `WHERE (service_address_formatted IS NOT NULL OR service_address_raw IS NOT NULL)
         AND service_lat IS NULL`;

  const limitClause = limit ? `LIMIT ${limit}` : '';

  const { rows } = await pool.query<{
    id: string;
    case_number: number;
    service_address_formatted: string | null;
    service_address_raw: string | null;
  }>(`SELECT id, case_number, service_address_formatted, service_address_raw
      FROM job_postings
      ${whereClause}
      ORDER BY case_number
      ${limitClause}`);

  console.log(`\n🌍 Geocoding job_postings`);
  console.log(`   Modo: ${dryRun ? 'DRY RUN' : 'REAL'} | Vagas: ${rows.length}${limit ? ` (limite: ${limit})` : ''}\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const address = row.service_address_formatted ?? row.service_address_raw ?? '';
    const source  = row.service_address_formatted ? 'formatted' : 'raw';

    const result = await geo.geocode(address, 'AR');

    if (!result) {
      console.log(`  ⚠  Caso ${row.case_number} — sem resultado: "${address.substring(0, 60)}"`);
      failed++;
    } else {
      console.log(`  ✅ Caso ${row.case_number} [${source}] → ${result.latitude}, ${result.longitude} (${result.formattedAddress.substring(0, 50)})`);

      if (!dryRun) {
        await pool.query(
          `UPDATE job_postings SET service_lat = $1, service_lng = $2 WHERE id = $3`,
          [result.latitude, result.longitude, row.id]
        );
      }
      ok++;
    }

    if (rows.indexOf(row) < rows.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n📊 Resultado: ${ok} geocodificados | ${failed} sem resultado | ${skipped} ignorados`);
  if (dryRun) console.log('   (dry-run: nenhuma alteração salva)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
