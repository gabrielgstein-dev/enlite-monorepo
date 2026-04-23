/**
 * backfill-patient-responsibles.ts
 *
 * Migra dados de responsáveis das colunas legadas patients.responsible_*
 * para a nova tabela patient_responsibles (migration 136).
 *
 * Pula:
 *   - Patients onde responsible_first_name AND responsible_last_name são ambos NULL/vazio.
 *   - Patients que já têm um responsável titular em patient_responsibles (idempotência).
 *
 * Nota: responsible_email não existia na tabela patients — email_encrypted fica NULL.
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/backfill-patient-responsibles.ts
 *   npx ts-node -r dotenv/config scripts/backfill-patient-responsibles.ts --dry-run
 */

import { Pool } from 'pg';
import { KMSEncryptionService } from '../src/shared/security/KMSEncryptionService';

interface PatientRow {
  id: string;
  responsible_first_name: string | null;
  responsible_last_name: string | null;
  responsible_relationship: string | null;
  responsible_phone: string | null;
  responsible_document_type: string | null;
  responsible_document_number: string | null;
}

interface BackfillResult {
  patientId: string;
  action: 'inserted' | 'skipped';
  reason?: string;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

const isDryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const kms = new KMSEncryptionService();

  console.log(`[backfill-patient-responsibles] mode=${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);

  // Load candidates: patients with at least one responsible name field populated
  const { rows: patients } = await pool.query<PatientRow>(
    `SELECT
       id,
       responsible_first_name,
       responsible_last_name,
       responsible_relationship,
       responsible_phone,
       responsible_document_type,
       responsible_document_number
     FROM patients
     WHERE responsible_first_name IS NOT NULL
        OR responsible_last_name  IS NOT NULL
     ORDER BY id`,
  );

  console.log(`[backfill-patient-responsibles] ${patients.length} pacientes candidatos`);

  const results: BackfillResult[] = [];

  for (const p of patients) {
    const firstName = p.responsible_first_name?.trim() ?? '';
    const lastName  = p.responsible_last_name?.trim()  ?? '';

    // Skip if both names are empty (safety guard beyond the WHERE clause)
    if (!firstName && !lastName) {
      results.push({ patientId: p.id, action: 'skipped', reason: 'both names empty' });
      continue;
    }

    // Check idempotency: skip if primary already exists
    const { rows: existing } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM patient_responsibles
         WHERE patient_id = $1 AND is_primary = true
       ) AS exists`,
      [p.id],
    );

    if (existing[0].exists) {
      results.push({ patientId: p.id, action: 'skipped', reason: 'primary already exists' });
      continue;
    }

    if (isDryRun) {
      results.push({ patientId: p.id, action: 'inserted' });
      continue;
    }

    // Encrypt PII fields
    const phoneEnc = await kms.encrypt(p.responsible_phone ?? null);
    const docEnc   = await kms.encrypt(p.responsible_document_number ?? null);
    // email_encrypted: legacy table had no responsible_email column → always null
    const emailEnc: string | null = null;

    // Idempotent insert: only if no primary exists (double-checked to avoid race)
    await pool.query(
      `INSERT INTO patient_responsibles
         (patient_id, first_name, last_name, relationship,
          phone_encrypted, email_encrypted, document_number_encrypted,
          document_type, is_primary, display_order, source)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, true, 1, 'legacy-patients-column'
       WHERE NOT EXISTS (
         SELECT 1 FROM patient_responsibles
         WHERE patient_id = $1 AND is_primary = true
       )`,
      [
        p.id,
        firstName || p.responsible_first_name ?? '',
        lastName  || p.responsible_last_name  ?? '',
        p.responsible_relationship    ?? null,
        phoneEnc,
        emailEnc,
        docEnc,
        p.responsible_document_type   ?? null,
      ],
    );

    results.push({ patientId: p.id, action: 'inserted' });
  }

  // Summary
  const inserted = results.filter(r => r.action === 'inserted').length;
  const skipped  = results.filter(r => r.action === 'skipped').length;

  console.log('\n[backfill-patient-responsibles] Resultado por paciente:');
  for (const r of results) {
    const detail = r.reason ? ` (${r.reason})` : '';
    console.log(`  ${r.action.padEnd(8)} patient_id=${r.patientId}${detail}`);
  }

  console.log(
    `\n[backfill-patient-responsibles] Concluído — ${inserted} inseridos, ${skipped} pulados.` +
    (isDryRun ? ' [DRY RUN — nenhuma escrita realizada]' : ''),
  );

  await pool.end();
}

main().catch(err => {
  console.error('[backfill-patient-responsibles] Erro fatal:', err);
  process.exit(1);
});
