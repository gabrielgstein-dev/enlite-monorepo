/**
 * patient-responsibles.test.ts
 *
 * Testa o domínio patient_responsibles contra o banco real (sem mocks).
 *
 * Casos cobertos:
 * 1. Import de patient com responsável cria linha em patient_responsibles com is_primary=true.
 * 2. Re-import do mesmo patient não duplica responsável titular (idempotência).
 * 3. Tentativa de 2º responsável com is_primary=true falha (UNIQUE partial index).
 * 4. Delete do patient cascateia para responsáveis.
 * 5. phone_encrypted e document_number_encrypted são base64 válido e diferem do plaintext.
 * 6. Regra Zod: phone_whatsapp=null AND responsible.phone=null AND responsible.email=null → rejeita.
 * 7. phone_whatsapp=null mas responsible.phone preenchido → aceita.
 *
 * Usa NODE_ENV=test → KMSEncryptionService em passthrough base64.
 */

import { Pool } from 'pg';
import { PatientService } from '../../src/modules/case';
import { validateContactChannel } from '../../src/modules/case';

// DatabaseConnection (singleton used internally by PatientService) requires
// process.env.DATABASE_URL. Ensure it is set before any PatientService
// instantiation, using the same default as other E2E tests.
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

let pool: Pool;

// Deterministic UUIDs to avoid cross-test pollution
const PATIENT_TASK_A = 'e2e-pr-task-alpha-001';
const PATIENT_TASK_B = 'e2e-pr-task-bravo-002';
const PATIENT_TASK_C = 'e2e-pr-task-charlie-003';
const PATIENT_TASK_D = 'e2e-pr-task-delta-004';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

async function cleanPatient(taskId: string): Promise<void> {
  // FK cascade handles patient_responsibles, patient_addresses, patient_professionals
  await pool.query(`DELETE FROM patients WHERE clickup_task_id = $1`, [taskId]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  // Pre-clean in case of dirty state from a previous failed run
  for (const taskId of [PATIENT_TASK_A, PATIENT_TASK_B, PATIENT_TASK_C, PATIENT_TASK_D]) {
    await cleanPatient(taskId);
  }
});

afterAll(async () => {
  for (const taskId of [PATIENT_TASK_A, PATIENT_TASK_B, PATIENT_TASK_C, PATIENT_TASK_D]) {
    await cleanPatient(taskId);
  }
  await pool.end();
});

// ─── Case 1: import creates is_primary responsible ───────────────────────────

describe('Case 1 — import creates patient_responsibles row with is_primary=true', () => {
  it('upsertFromClickUp creates patient and one primary responsible', async () => {
    const svc = new PatientService();
    const { id, created } = await svc.upsertFromClickUp({
      clickupTaskId: PATIENT_TASK_A,
      firstName: 'Ana',
      lastName: 'García',
      phoneWhatsapp: null,
      responsibles: [{
        firstName: 'María',
        lastName: 'García',
        relationship: 'PARENT',  // canonical EN (was 'madre' ES before migration 139)
        phone: '+541155550001',
        email: null,
        documentType: 'DNI',
        documentNumber: '12345678',
        isPrimary: true,
        displayOrder: 1,
      }],
      country: 'AR',
    });

    expect(created).toBe(true);
    expect(id).toBeTruthy();

    const { rows } = await pool.query(
      `SELECT first_name, last_name, relationship, is_primary, display_order, source
       FROM patient_responsibles WHERE patient_id = $1`,
      [id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe('María');
    expect(rows[0].last_name).toBe('García');
    expect(rows[0].relationship).toBe('PARENT');  // canonical EN (was 'madre' ES before migration 139)
    expect(rows[0].is_primary).toBe(true);
    expect(rows[0].display_order).toBe(1);
    expect(rows[0].source).toBe('clickup');
  });
});

// ─── Case 2: re-import does not duplicate primary responsible ─────────────────

describe('Case 2 — re-import is idempotent (no duplicate primary responsible)', () => {
  it('second upsertFromClickUp replaces responsible, not duplicates', async () => {
    const svc = new PatientService();

    // First import
    const { id } = await svc.upsertFromClickUp({
      clickupTaskId: PATIENT_TASK_B,
      firstName: 'Lucía',
      lastName: 'Pérez',
      phoneWhatsapp: '+541155550002',
      responsibles: [{
        firstName: 'Carlos',
        lastName: 'Pérez',
        relationship: 'PARENT',  // canonical EN (was 'padre' ES before migration 139)
        phone: '+541155550003',
        email: null,
        isPrimary: true,
        displayOrder: 1,
      }],
      country: 'AR',
    });

    // Second import — same task, updated responsible name
    await svc.upsertFromClickUp({
      clickupTaskId: PATIENT_TASK_B,
      firstName: 'Lucía',
      lastName: 'Pérez',
      phoneWhatsapp: '+541155550002',
      responsibles: [{
        firstName: 'Carlos Alberto',
        lastName: 'Pérez',
        relationship: 'PARENT',  // canonical EN (was 'padre' ES before migration 139)
        phone: '+541155550003',
        email: null,
        isPrimary: true,
        displayOrder: 1,
      }],
      country: 'AR',
    });

    const { rows } = await pool.query(
      `SELECT first_name FROM patient_responsibles WHERE patient_id = $1 AND is_primary = true`,
      [id],
    );

    // Exactly one primary responsible, with updated name
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe('Carlos Alberto');
  });
});

// ─── Case 3: two is_primary=true for same patient → DB rejects ───────────────

describe('Case 3 — partial unique index rejects second is_primary=true', () => {
  it('inserting a second is_primary=true for same patient throws unique violation', async () => {
    // Insert first primary manually to isolate the DB constraint
    const { rows: [patient] } = await pool.query<{ id: string }>(
      `INSERT INTO patients (clickup_task_id, first_name, country)
       VALUES ($1, 'Constraint', 'AR') RETURNING id`,
      [PATIENT_TASK_C],
    );
    const patientId = patient.id;

    await pool.query(
      `INSERT INTO patient_responsibles
         (patient_id, first_name, last_name, is_primary, display_order)
       VALUES ($1, 'Resp', 'Uno', true, 1)`,
      [patientId],
    );

    await expect(
      pool.query(
        `INSERT INTO patient_responsibles
           (patient_id, first_name, last_name, is_primary, display_order)
         VALUES ($1, 'Resp', 'Dos', true, 2)`,
        [patientId],
      ),
    ).rejects.toThrow(/unique/i);
  });
});

// ─── Case 4: DELETE patient cascades to patient_responsibles ──────────────────

describe('Case 4 — DELETE patient cascades to patient_responsibles', () => {
  it('deleting patient removes all its responsibles', async () => {
    const { rows: [patient] } = await pool.query<{ id: string }>(
      `INSERT INTO patients (clickup_task_id, first_name, country)
       VALUES ($1, 'Cascade', 'AR') RETURNING id`,
      [PATIENT_TASK_D],
    );
    const patientId = patient.id;

    await pool.query(
      `INSERT INTO patient_responsibles
         (patient_id, first_name, last_name, is_primary, display_order)
       VALUES ($1, 'Resp', 'Cascade', true, 1)`,
      [patientId],
    );

    await pool.query(`DELETE FROM patients WHERE id = $1`, [patientId]);

    const { rows } = await pool.query(
      `SELECT id FROM patient_responsibles WHERE patient_id = $1`,
      [patientId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ─── Case 5: phone/document are base64 and differ from plaintext ──────────────

describe('Case 5 — phone_encrypted and document_number_encrypted are KMS-encrypted', () => {
  it('stored values are base64 and differ from plaintext', async () => {
    const phone    = '+541155559999';
    const docNum   = '98765432';

    const svc = new PatientService();
    const { id } = await svc.upsertFromClickUp({
      clickupTaskId: 'e2e-pr-enc-test-001',
      firstName: 'Enc',
      lastName: 'Test',
      phoneWhatsapp: null,
      responsibles: [{
        firstName: 'Enc',
        lastName: 'Responsible',
        phone,
        email: null,
        documentNumber: docNum,
        isPrimary: true,
        displayOrder: 1,
      }],
      country: 'AR',
    });

    const { rows } = await pool.query(
      `SELECT phone_encrypted, document_number_encrypted
       FROM patient_responsibles WHERE patient_id = $1`,
      [id],
    );

    expect(rows).toHaveLength(1);

    const { phone_encrypted, document_number_encrypted } = rows[0];

    // Must not be plaintext
    expect(phone_encrypted).not.toBe(phone);
    expect(document_number_encrypted).not.toBe(docNum);

    // Must be valid base64 (KMS test-mode passthrough)
    expect(phone_encrypted).toBe(b64(phone));
    expect(document_number_encrypted).toBe(b64(docNum));

    // Round-trip sanity
    expect(Buffer.from(phone_encrypted, 'base64').toString('utf8')).toBe(phone);
    expect(Buffer.from(document_number_encrypted, 'base64').toString('utf8')).toBe(docNum);

    // Cleanup
    await pool.query(`DELETE FROM patients WHERE clickup_task_id = 'e2e-pr-enc-test-001'`);
  });
});

// ─── Case 6: contact channel validation — all channels null → rejects ─────────

describe('Case 6 — contact channel invariant: all null channels are rejected', () => {
  it('validateContactChannel throws when patient and responsible have no contact', () => {
    expect(() =>
      validateContactChannel({
        patientPhoneWhatsapp: null,
        primaryResponsible: {
          firstName: 'No',
          lastName: 'Contact',
          phone: null,
          email: null,
          isPrimary: true,
          displayOrder: 1,
        },
      }),
    ).toThrow(/ao menos 1 canal/i);
  });

  it('PatientService.upsertFromClickUp rejects when all contact channels are null', async () => {
    const svc = new PatientService();
    await expect(
      svc.upsertFromClickUp({
        clickupTaskId: 'e2e-pr-no-contact-001',
        firstName: 'No',
        lastName: 'Contact',
        phoneWhatsapp: null,
        responsibles: [{
          firstName: 'No',
          lastName: 'Contact',
          phone: null,
          email: null,
          isPrimary: true,
          displayOrder: 1,
        }],
        country: 'AR',
      }),
    ).rejects.toThrow(/ao menos 1 canal/i);
  });
});

// ─── Case 7: responsible phone present, patient phone absent → accepts ────────

describe('Case 7 — responsible phone is sufficient even if patient has no phone', () => {
  it('upsertFromClickUp accepts when responsible has phone and patient has none', async () => {
    const svc = new PatientService();
    const { id } = await svc.upsertFromClickUp({
      clickupTaskId: 'e2e-pr-resp-phone-ok-001',
      firstName: 'Nophone',
      lastName: 'Patient',
      phoneWhatsapp: null, // patient has no phone
      responsibles: [{
        firstName: 'Has',
        lastName: 'Phone',
        phone: '+541155550099', // responsible has phone — satisfies invariant
        email: null,
        isPrimary: true,
        displayOrder: 1,
      }],
      country: 'AR',
    });

    expect(id).toBeTruthy();

    const { rows } = await pool.query(
      `SELECT is_primary FROM patient_responsibles WHERE patient_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_primary).toBe(true);

    // Cleanup
    await pool.query(`DELETE FROM patients WHERE clickup_task_id = 'e2e-pr-resp-phone-ok-001'`);
  });
});
