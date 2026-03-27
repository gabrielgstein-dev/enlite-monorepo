#!/usr/bin/env node
/**
 * Idempotent migration runner for Docker/local environments.
 * Uses DATABASE_URL env var and a schema_migrations tracking table.
 * Safe to run multiple times — already-applied migrations are skipped.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Ensure tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Load already-applied migrations
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    // List all .sql files, sorted alphabetically (stable order)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    let skipped = 0;

    for (const file of files) {
      if (applied.has(file)) {
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied: ${file}`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed: ${file}`);
        console.error(err.message);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    console.log(`\n🎉 Migrations complete — ${ran} applied, ${skipped} skipped.`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
