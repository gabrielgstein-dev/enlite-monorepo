/**
 * db-test-helper.ts
 *
 * Direct DB access helpers for integration E2E tests.
 * Uses `docker exec enlite-postgres psql` to run SQL without adding `pg`
 * as a frontend dependency (the same approach as admin-patient-detail-integration.e2e.ts).
 *
 * Connection target: enlite_e2e database on the Docker enlite-postgres container.
 */

import { execSync } from 'child_process';

// ── Constants ───────────────────────────────────────────────────────────────

const CONTAINER = 'enlite-postgres';
const DB_USER = 'enlite_admin';
const DB_NAME = 'enlite_e2e';

// ── Internal helpers ────────────────────────────────────────────────────────

/** Runs a SQL string inside the Docker container. Returns stdout. */
function runSQL(sql: string): string {
  const escaped = sql.replace(/'/g, "'\\''");
  try {
    return execSync(
      `docker exec ${CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c '${escaped}'`,
      { stdio: 'pipe' },
    ).toString();
  } catch (err: any) {
    throw new Error(`DB error: ${err.stderr?.toString() ?? err.message}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface InsertTestPatientOpts {
  status?: string;
  firstName?: string;
  lastName?: string;
  diagnosis?: string;
  dependencyLevel?: string;
  withAddress?: boolean;
  addressLat?: number;
  addressLng?: number;
}

export interface InsertTestPatientResult {
  patientId: string;
  addressId: string | null;
}

/**
 * Inserts a test patient (and optionally one primary address) directly into
 * the DB. Uses a unique `clickup_task_id` suffix to avoid collisions.
 */
export function insertTestPatient(
  opts: InsertTestPatientOpts = {},
): InsertTestPatientResult {
  const {
    status = 'ACTIVE',
    firstName = 'IntegTest',
    lastName = `Patient${Date.now()}`,
    diagnosis = 'TEA leve',
    dependencyLevel = 'SEVERE',
    withAddress = false,
    addressLat = -34.6037,
    addressLng = -58.3816,
  } = opts;

  const clickupTaskId = `E2E-INT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  runSQL(`
    INSERT INTO patients (
      clickup_task_id, first_name, last_name, status,
      diagnosis, dependency_level, country, created_at, updated_at
    ) VALUES (
      '${clickupTaskId}',
      '${firstName}',
      '${lastName}',
      '${status}',
      '${diagnosis}',
      '${dependencyLevel}',
      'AR',
      NOW(), NOW()
    )
  `);

  const idRow = runSQL(
    `SELECT id FROM patients WHERE clickup_task_id = '${clickupTaskId}'`,
  );
  const patientId = extractUUID(idRow);
  if (!patientId) {
    throw new Error(`Could not find patient after insert (clickup_task_id=${clickupTaskId})`);
  }

  let addressId: string | null = null;

  if (withAddress) {
    runSQL(`
      INSERT INTO patient_addresses (
        patient_id, address_type, address_formatted, address_raw,
        lat, lng, display_order, source, created_at, updated_at
      ) VALUES (
        '${patientId}',
        'primary',
        'Av. Corrientes 1234, CABA, AR',
        'Av. Corrientes 1234, CABA',
        ${addressLat},
        ${addressLng},
        1,
        'manual',
        NOW(), NOW()
      )
    `);

    const addrRow = runSQL(
      `SELECT id FROM patient_addresses WHERE patient_id = '${patientId}' LIMIT 1`,
    );
    addressId = extractUUID(addrRow);
  }

  return { patientId, addressId };
}

/**
 * Deletes all job_postings, patient_addresses and the patient itself for a
 * given patientId. Safe to call even if no rows exist or patientId is empty.
 */
export function cleanupTestPatient(patientId: string): void {
  if (!patientId || patientId === 'undefined') return;
  runSQL(`DELETE FROM job_postings WHERE patient_id = '${patientId}'`);
  runSQL(`DELETE FROM patient_addresses WHERE patient_id = '${patientId}'`);
  runSQL(`DELETE FROM patients WHERE id = '${patientId}'`);
}

export interface JobPostingRow {
  id: string;
  status: string;
  patient_id: string | null;
  patient_address_id: string | null;
  schedule: unknown;
  title: string;
}

/** Fetches a job_posting row directly from the DB for assertion purposes. */
export function getVacancyById(id: string): JobPostingRow | null {
  const out = runSQL(
    `SELECT id, status, patient_id, patient_address_id, schedule::text AS schedule, title
     FROM job_postings
     WHERE id = '${id}'`,
  );
  const lines = out.split('\n').filter(l => l.trim());
  // psql output: header + separator + data rows + count row
  // Find the data line (after the "---" separator)
  const sepIdx = lines.findIndex(l => l.startsWith('-'));
  if (sepIdx === -1) return null;
  const dataLine = lines[sepIdx + 1];
  if (!dataLine || dataLine.includes('(0 rows)')) return null;

  const parts = dataLine.split('|').map(s => s.trim());
  return {
    id: parts[0] ?? '',
    status: parts[1] ?? '',
    patient_id: parts[2] || null,
    patient_address_id: parts[3] || null,
    schedule: parts[4] || null,
    title: parts[5] ?? '',
  };
}

/** Fetches all patient_addresses for a patient. */
export function getPatientAddresses(patientId: string): string[] {
  const out = runSQL(
    `SELECT id FROM patient_addresses WHERE patient_id = '${patientId}' ORDER BY created_at`,
  );
  const lines = out.split('\n').filter(l => l.trim());
  const sepIdx = lines.findIndex(l => l.startsWith('-'));
  if (sepIdx === -1) return [];
  return lines
    .slice(sepIdx + 1)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('('));
}

// ── Internal ─────────────────────────────────────────────────────────────────

/** Extracts the first UUID-shaped string from psql output. */
function extractUUID(psqlOutput: string): string | null {
  const match = psqlOutput.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return match ? match[0] : null;
}
