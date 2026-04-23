/**
 * migrate-blacklist-pii.ts
 *
 * Migra dados legados da blacklist: encripta reason e detail
 * para as colunas reason_encrypted e detail_encrypted.
 *
 * Uso: npx ts-node scripts/migrate-blacklist-pii.ts
 */
import { Pool } from 'pg';
import { KMSEncryptionService } from '../src/shared/security/KMSEncryptionService';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';
const BATCH_SIZE = 100;

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const kms = new KMSEncryptionService();

  const { rows } = await pool.query(
    'SELECT id, reason, detail FROM blacklist WHERE reason_encrypted IS NULL AND reason IS NOT NULL'
  );

  console.log(`[migrate-blacklist-pii] ${rows.length} registros para migrar`);

  let migrated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const reasonEnc = await kms.encrypt(row.reason);
      const detailEnc = await kms.encrypt(row.detail);
      await pool.query(
        'UPDATE blacklist SET reason_encrypted = $1, detail_encrypted = $2 WHERE id = $3',
        [reasonEnc, detailEnc, row.id]
      );
      migrated++;
    }
    console.log(`[migrate-blacklist-pii] Migrados: ${migrated}/${rows.length}`);
  }

  // Validação final
  const missing = await pool.query(
    'SELECT COUNT(*) FROM blacklist WHERE reason IS NOT NULL AND reason_encrypted IS NULL'
  );
  const count = parseInt(missing.rows[0].count);
  if (count > 0) {
    console.error(`[migrate-blacklist-pii] ERRO: ${count} registros ainda sem encryption`);
    process.exit(1);
  }

  console.log(`[migrate-blacklist-pii] Migração completa. ${migrated} registros encriptados.`);
  await pool.end();
}

main().catch(err => {
  console.error('[migrate-blacklist-pii] Erro fatal:', err);
  process.exit(1);
});
