/**
 * wave3-pii-encryption.test.ts
 *
 * Testa os 4 itens do Wave 3 do roadmap de correção de schema,
 * contra o banco real (sem mocks).
 *
 * C2:   encuadres.worker_email → worker_email_encrypted
 * C2-B: patient_professionals.phone/email → _encrypted
 * C2-D: workers.whatsapp_phone → whatsapp_phone_encrypted
 * N2:   workers.linkedin_url plaintext removido
 */

import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

let pool: Pool;

// UUIDs determinísticos para isolamento do teste
const WORKER_ID = 'ee330000-0a0e-0003-0001-000000000001';
const JOB_ID = 'ee330000-0a0e-0003-aaa0-000000000001';
const PATIENT_ID = 'ee330000-0a0e-0003-bbb0-000000000001';
const ENCUADRE_ID = 'ee330000-0a0e-0003-ccc0-000000000001';
const PROF_ID = 'ee330000-0a0e-0003-ddd0-000000000001';

// Base64 encode helper (simulates KMS test mode)
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });

  // Limpar dados de teste anteriores (ordem de FK: filhos primeiro)
  await pool.query(`DELETE FROM encuadres WHERE id = $1`, [ENCUADRE_ID]);
  await pool.query(`DELETE FROM patient_professionals WHERE id = $1`, [PROF_ID]);
  await pool.query(`DELETE FROM patient_professionals WHERE patient_id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM patient_addresses WHERE patient_id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM job_postings WHERE id = $1`, [JOB_ID]);
  await pool.query(`DELETE FROM patients WHERE id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM workers WHERE id = $1`, [WORKER_ID]);

  // Seed: worker
  await pool.query(
    `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, country, timezone)
     VALUES ($1, 'e2e-wave3-w1', 'w1@wave3.test', '5411000030001', 'approved', 'ACTIVE', 'AR', 'America/Buenos_Aires')
     ON CONFLICT (auth_uid) DO NOTHING`,
    [WORKER_ID],
  );

  // Seed: job_posting
  await pool.query(
    `INSERT INTO job_postings (id, title, status, country)
     VALUES ($1, 'Wave3 test posting', 'active', 'AR')
     ON CONFLICT DO NOTHING`,
    [JOB_ID],
  );

  // Seed: patient
  await pool.query(
    `INSERT INTO patients (id, clickup_task_id, first_name, country)
     VALUES ($1, 'wave3-test-task', 'TestPatient', 'AR')
     ON CONFLICT DO NOTHING`,
    [PATIENT_ID],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM encuadres WHERE id = $1`, [ENCUADRE_ID]);
  await pool.query(`DELETE FROM patient_professionals WHERE id = $1`, [PROF_ID]);
  await pool.query(`DELETE FROM patient_professionals WHERE patient_id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM patient_addresses WHERE patient_id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM job_postings WHERE id = $1`, [JOB_ID]);
  await pool.query(`DELETE FROM patients WHERE id = $1`, [PATIENT_ID]);
  await pool.query(`DELETE FROM workers WHERE id = $1`, [WORKER_ID]);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════
// C2 — encuadres.worker_email → worker_email_encrypted
// ═══════════════════════════════════════════════════════════════

describe('C2 — encuadres.worker_email_encrypted', () => {
  it('coluna worker_email plaintext NÃO existe em encuadres', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'encuadres' AND column_name = 'worker_email'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('coluna worker_email_encrypted existe, é TEXT nullable', async () => {
    const result = await pool.query<{
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'encuadres' AND column_name = 'worker_email_encrypted'
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].data_type).toBe('text');
    expect(result.rows[0].is_nullable).toBe('YES');
  });

  it('encuadre salvo com ciphertext não contém @ (email plaintext)', async () => {
    const emailEnc = b64('worker@example.com');

    await pool.query(
      `INSERT INTO encuadres (id, worker_id, job_posting_id, worker_email_encrypted, dedup_hash)
       VALUES ($1, $2, $3, $4, 'wave3-c2-test-hash')
       ON CONFLICT (dedup_hash) DO UPDATE SET worker_email_encrypted = EXCLUDED.worker_email_encrypted`,
      [ENCUADRE_ID, WORKER_ID, JOB_ID, emailEnc],
    );

    const result = await pool.query<{ worker_email_encrypted: string }>(
      `SELECT worker_email_encrypted FROM encuadres WHERE id = $1`,
      [ENCUADRE_ID],
    );

    expect(result.rows.length).toBe(1);
    // Ciphertext (base64 in test mode) should NOT contain '@'
    expect(result.rows[0].worker_email_encrypted).not.toContain('@');
  });

  it('round-trip encrypt/decrypt retorna o email original', async () => {
    const result = await pool.query<{ worker_email_encrypted: string }>(
      `SELECT worker_email_encrypted FROM encuadres WHERE id = $1`,
      [ENCUADRE_ID],
    );

    const decrypted = unb64(result.rows[0].worker_email_encrypted);
    expect(decrypted).toBe('worker@example.com');
  });
});

// ═══════════════════════════════════════════════════════════════
// C2-B — patient_professionals.phone/email → _encrypted
// ═══════════════════════════════════════════════════════════════

describe('C2-B — patient_professionals.phone_encrypted e email_encrypted', () => {
  it('coluna phone plaintext NÃO existe em patient_professionals', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'patient_professionals' AND column_name = 'phone'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('coluna email plaintext NÃO existe em patient_professionals', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'patient_professionals' AND column_name = 'email'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('colunas phone_encrypted e email_encrypted existem, são TEXT nullable', async () => {
    const result = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'patient_professionals'
        AND column_name IN ('phone_encrypted', 'email_encrypted')
      ORDER BY column_name
    `);

    expect(result.rows.length).toBe(2);
    for (const row of result.rows) {
      expect(row.data_type).toBe('text');
      expect(row.is_nullable).toBe('YES');
    }
  });

  it('profissional salvo com ciphertext não contém @ ou +', async () => {
    const phoneEnc = b64('+5411999887766');
    const emailEnc = b64('doctor@clinic.com');

    await pool.query(
      `INSERT INTO patient_professionals (id, patient_id, name, phone_encrypted, email_encrypted, display_order, source)
       VALUES ($1, $2, 'Dr. Wave3 Test', $3, $4, 1, 'test')
       ON CONFLICT DO NOTHING`,
      [PROF_ID, PATIENT_ID, phoneEnc, emailEnc],
    );

    const result = await pool.query<{ phone_encrypted: string; email_encrypted: string }>(
      `SELECT phone_encrypted, email_encrypted FROM patient_professionals WHERE id = $1`,
      [PROF_ID],
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].phone_encrypted).not.toContain('+');
    expect(result.rows[0].email_encrypted).not.toContain('@');
  });

  it('round-trip encrypt/decrypt retorna dados originais', async () => {
    const result = await pool.query<{ phone_encrypted: string; email_encrypted: string }>(
      `SELECT phone_encrypted, email_encrypted FROM patient_professionals WHERE id = $1`,
      [PROF_ID],
    );

    expect(unb64(result.rows[0].phone_encrypted)).toBe('+5411999887766');
    expect(unb64(result.rows[0].email_encrypted)).toBe('doctor@clinic.com');
  });
});

// ═══════════════════════════════════════════════════════════════
// C2-D — workers.whatsapp_phone → whatsapp_phone_encrypted
// ═══════════════════════════════════════════════════════════════

describe('C2-D — workers.whatsapp_phone_encrypted', () => {
  it('coluna whatsapp_phone plaintext NÃO existe em workers', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workers' AND column_name = 'whatsapp_phone'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('coluna whatsapp_phone_encrypted existe, é TEXT nullable', async () => {
    const result = await pool.query<{
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workers' AND column_name = 'whatsapp_phone_encrypted'
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].data_type).toBe('text');
    expect(result.rows[0].is_nullable).toBe('YES');
  });

  it('worker com whatsapp_phone_encrypted não contém + em plaintext', async () => {
    const whatsappEnc = b64('+5411999001122');

    await pool.query(
      `UPDATE workers SET whatsapp_phone_encrypted = $2 WHERE id = $1`,
      [WORKER_ID, whatsappEnc],
    );

    const result = await pool.query<{ whatsapp_phone_encrypted: string }>(
      `SELECT whatsapp_phone_encrypted FROM workers WHERE id = $1`,
      [WORKER_ID],
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].whatsapp_phone_encrypted).not.toContain('+');
  });

  it('round-trip encrypt/decrypt retorna número original', async () => {
    const result = await pool.query<{ whatsapp_phone_encrypted: string }>(
      `SELECT whatsapp_phone_encrypted FROM workers WHERE id = $1`,
      [WORKER_ID],
    );

    expect(unb64(result.rows[0].whatsapp_phone_encrypted)).toBe('+5411999001122');
  });
});

// ═══════════════════════════════════════════════════════════════
// N2 — workers.linkedin_url plaintext removido
// ═══════════════════════════════════════════════════════════════

describe('N2 — workers.linkedin_url plaintext removido', () => {
  it('coluna linkedin_url NÃO existe em workers', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workers' AND column_name = 'linkedin_url'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('índice idx_workers_linkedin NÃO existe', async () => {
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'workers' AND indexname = 'idx_workers_linkedin'
    `);
    expect(result.rows.length).toBe(0);
  });

  it('coluna linkedin_url_encrypted ainda existe', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workers' AND column_name = 'linkedin_url_encrypted'
    `);
    expect(result.rows.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Regressão — Linter de PII
// ═══════════════════════════════════════════════════════════════

describe('Regressão — Linter de PII Wave 3', () => {
  it('nenhuma coluna PII plaintext existe nas tabelas corrigidas', async () => {
    // Busca colunas que contenham email, phone, whatsapp, linkedin sem _encrypted
    const result = await pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'encuadres' AND column_name = 'worker_email')
          OR (table_name = 'patient_professionals' AND column_name IN ('phone', 'email'))
          OR (table_name = 'workers' AND column_name IN ('whatsapp_phone', 'linkedin_url'))
        )
    `);

    const violations = result.rows.map(r => `${r.table_name}.${r.column_name}`);
    expect(violations).toEqual([]);
  });

  it('colunas _encrypted correspondentes existem em todas as tabelas', async () => {
    const expected = [
      { table: 'encuadres', col: 'worker_email_encrypted' },
      { table: 'patient_professionals', col: 'phone_encrypted' },
      { table: 'patient_professionals', col: 'email_encrypted' },
      { table: 'workers', col: 'whatsapp_phone_encrypted' },
      { table: 'workers', col: 'linkedin_url_encrypted' },
    ];

    const missing: string[] = [];
    for (const { table, col } of expected) {
      const result = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `, [table, col]);

      if (result.rows.length === 0) {
        missing.push(`${table}.${col}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
