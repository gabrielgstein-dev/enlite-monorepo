#!/usr/bin/env node
/**
 * Runs just the post-import linking step:
 * - encuadres.linkWorkersByPhone()
 * - blacklist.linkWorkersByPhone()
 * - import_jobs status update
 */
require('dotenv').config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
}

const { Pool } = require('pg');

const JOB_ID = '4a83c4e5-df00-4198-a817-5397ded81b4c';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('Connecting to DB...');
  await pool.query('SELECT 1');
  console.log('Connected.');

  // Count before
  const before = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM encuadres) AS encuadres,
      (SELECT COUNT(*) FROM encuadres WHERE worker_id IS NOT NULL) AS enc_linked,
      (SELECT COUNT(*) FROM blacklist) AS blacklist,
      (SELECT COUNT(*) FROM blacklist WHERE worker_id IS NOT NULL) AS bl_linked
  `);
  console.log('Before linking:', before.rows[0]);

  // Link encuadres by phone
  console.log('\nLinking encuadres by phone...');
  const encResult = await pool.query(`
    UPDATE encuadres e
    SET worker_id = w.id
    FROM workers w
    WHERE e.worker_id IS NULL
      AND e.worker_raw_phone IS NOT NULL
      AND w.phone = e.worker_raw_phone
  `);
  console.log('Encuadres linked:', encResult.rowCount);

  // Link blacklist by phone (DISTINCT ON to avoid duplicate-key on unique(worker_id, reason))
  console.log('\nLinking blacklist by phone...');
  const blResult = await pool.query(`
    WITH candidates AS (
      SELECT DISTINCT ON (b.worker_raw_phone, b.reason)
        b.id,
        w.id AS new_worker_id
      FROM blacklist b
      JOIN workers w ON w.phone = b.worker_raw_phone
      WHERE b.worker_id IS NULL
        AND b.worker_raw_phone IS NOT NULL
      ORDER BY b.worker_raw_phone, b.reason, b.id
    )
    UPDATE blacklist b
    SET worker_id = c.new_worker_id
    FROM candidates c
    WHERE b.id = c.id
  `);
  console.log('Blacklist linked:', blResult.rowCount);

  // Update import job status to 'done'
  console.log('\nUpdating import job status to done...');
  await pool.query(
    "UPDATE import_jobs SET status = 'done', completed_at = NOW() WHERE id = $1",
    [JOB_ID]
  );
  console.log('Job status updated.');

  // Count after
  const after = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM encuadres) AS encuadres,
      (SELECT COUNT(*) FROM encuadres WHERE worker_id IS NOT NULL) AS enc_linked,
      (SELECT COUNT(*) FROM blacklist) AS blacklist,
      (SELECT COUNT(*) FROM blacklist WHERE worker_id IS NOT NULL) AS bl_linked,
      (SELECT resultado, COUNT(*) FROM encuadres GROUP BY resultado ORDER BY COUNT(*) DESC LIMIT 10) AS resultado_dist
  `);
  console.log('After linking:', after.rows[0]);

  // Resultado distribution
  const dist = await pool.query(`
    SELECT resultado, COUNT(*) AS cnt
    FROM encuadres
    GROUP BY resultado
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.log('\nResultado distribution:');
  dist.rows.forEach(r => console.log(`  ${r.resultado ?? 'NULL'}: ${r.cnt}`));

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
