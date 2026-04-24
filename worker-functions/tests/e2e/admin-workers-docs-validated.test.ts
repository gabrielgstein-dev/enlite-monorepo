/**
 * admin-workers-docs-validated.test.ts
 *
 * Testa o filtro docs_validated=true nos endpoints de listagem e export de workers.
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 *
 * Endpoints cobertos:
 *   GET /api/admin/workers?docs_validated=true
 *   GET /api/admin/workers/export?docs_validated=true&format=csv&columns=email
 *
 * Cenários:
 *   1. Worker AT com as 8 keys validadas → retornado
 *   2. Worker AT com 7 keys (falta at_certificate) → NÃO retornado
 *   3. Worker base (profession = null) com 6 keys validadas → retornado
 *   4. Worker sem linha em worker_documents → NÃO retornado
 *   5. Combinação com case_id → aplica AND corretamente
 *   6. Export também respeita o filtro
 */

import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

/** All 8 doc slugs that must be present for an AT worker. */
const AT_ALL_SLUGS = [
  'resume_cv',
  'identity_document',
  'identity_document_back',
  'criminal_record',
  'professional_registration',
  'liability_insurance',
  'monotributo_certificate',
  'at_certificate',
];

/** 6 base doc slugs for non-AT workers. */
const BASE_SLUGS = [
  'resume_cv',
  'identity_document',
  'identity_document_back',
  'criminal_record',
  'professional_registration',
  'liability_insurance',
];

/** Build a JSONB-compatible object where each slug maps to a minimal validation entry. */
function makeValidations(slugs: string[]): Record<string, unknown> {
  return Object.fromEntries(
    slugs.map((s) => [s, { validated_by: 'test@e2e.local', validated_at: new Date().toISOString() }]),
  );
}

describe('docs_validated filter — list and export', () => {
  const api = createApiClient();
  let adminToken: string;
  let pool: Pool;

  // Worker IDs seeded for this suite
  let atFullId: string;       // AT with all 8 slugs — should match
  let atMissingId: string;    // AT missing at_certificate — should NOT match
  let baseFullId: string;     // non-AT with 6 base slugs — should match
  let noDocsId: string;       // no worker_documents row — should NOT match

  // Unique emails so we can verify presence/absence in CSV body
  const ts = Date.now();
  const atFullEmail = `dv-at-full-${ts}@e2e.local`;
  const atMissingEmail = `dv-at-missing-${ts}@e2e.local`;
  const baseFullEmail = `dv-base-full-${ts}@e2e.local`;
  const noDocsEmail = `dv-no-docs-${ts}@e2e.local`;

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'dv-admin-e2e',
      email: 'dv-admin@e2e.local',
      role: 'admin',
    });

    pool = new Pool({ connectionString: DATABASE_URL });

    // 1. AT worker — all 8 slugs validated
    const r1 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, 'AT', 'REGISTERED') RETURNING id`,
      [`dv-at-full-${ts}`, atFullEmail],
    );
    atFullId = r1.rows[0].id;
    await pool.query(
      `INSERT INTO worker_documents (worker_id, document_validations)
       VALUES ($1, $2::jsonb)`,
      [atFullId, JSON.stringify(makeValidations(AT_ALL_SLUGS))],
    );

    // 2. AT worker — 7 slugs (missing at_certificate)
    const r2 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, 'AT', 'REGISTERED') RETURNING id`,
      [`dv-at-missing-${ts}`, atMissingEmail],
    );
    atMissingId = r2.rows[0].id;
    const sevenSlugs = AT_ALL_SLUGS.filter((s) => s !== 'at_certificate');
    await pool.query(
      `INSERT INTO worker_documents (worker_id, document_validations)
       VALUES ($1, $2::jsonb)`,
      [atMissingId, JSON.stringify(makeValidations(sevenSlugs))],
    );

    // 3. Base worker (profession = null) — 6 base slugs validated
    const r3 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, NULL, 'REGISTERED') RETURNING id`,
      [`dv-base-full-${ts}`, baseFullEmail],
    );
    baseFullId = r3.rows[0].id;
    await pool.query(
      `INSERT INTO worker_documents (worker_id, document_validations)
       VALUES ($1, $2::jsonb)`,
      [baseFullId, JSON.stringify(makeValidations(BASE_SLUGS))],
    );

    // 4. Worker without any worker_documents row
    const r4 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, NULL, 'REGISTERED') RETURNING id`,
      [`dv-no-docs-${ts}`, noDocsEmail],
    );
    noDocsId = r4.rows[0].id;
    // Intentionally no worker_documents insert
  });

  afterAll(async () => {
    if (!pool) return;
    const ids = [atFullId, atMissingId, baseFullId, noDocsId].filter(Boolean);
    for (const id of ids) {
      await pool.query('DELETE FROM worker_documents WHERE worker_id = $1', [id]);
      await pool.query('DELETE FROM workers WHERE id = $1', [id]);
    }
    await pool.end();
  });

  function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  // ── Helper: collect IDs returned by the list endpoint ──────────────────────
  async function listDocsValidated(extra = ''): Promise<string[]> {
    const res = await api.get(
      `/api/admin/workers?docs_validated=true&limit=1000${extra}`,
      authHeaders(adminToken),
    );
    expect(res.status).toBe(200);
    return (res.data.data as { id: string }[]).map((w) => w.id);
  }

  // ── 1. AT worker with all 8 slugs → INCLUDED ───────────────────────────────
  it('AT worker com todas as 8 chaves validadas é retornado', async () => {
    const ids = await listDocsValidated();
    expect(ids).toContain(atFullId);
  });

  // ── 2. AT worker missing at_certificate → EXCLUDED ─────────────────────────
  it('AT worker sem at_certificate NÃO é retornado', async () => {
    const ids = await listDocsValidated();
    expect(ids).not.toContain(atMissingId);
  });

  // ── 3. Base worker (profession = null) with 6 slugs → INCLUDED ─────────────
  it('Worker base com as 6 chaves validadas é retornado', async () => {
    const ids = await listDocsValidated();
    expect(ids).toContain(baseFullId);
  });

  // ── 4. Worker without worker_documents row → EXCLUDED ──────────────────────
  it('Worker sem linha em worker_documents NÃO é retornado', async () => {
    const ids = await listDocsValidated();
    expect(ids).not.toContain(noDocsId);
  });

  // ── 5. Combination with case_id filter ──────────────────────────────────────
  it('combinação com case_id inexistente retorna lista vazia (AND aplicado corretamente)', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const ids = await listDocsValidated(`&case_id=${fakeUuid}`);
    // Our seeded workers have no encuadres, so none should appear with that case_id
    expect(ids).not.toContain(atFullId);
    expect(ids).not.toContain(baseFullId);
  });

  // ── 6. Export endpoint — docs_validated=true ────────────────────────────────
  describe('GET /api/admin/workers/export?docs_validated=true', () => {
    it('CSV inclui worker AT completo e worker base completo', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email&docs_validated=true',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const body = res.data as string;
      expect(body).toContain(atFullEmail);
      expect(body).toContain(baseFullEmail);
    });

    it('CSV NÃO inclui AT com chave faltando', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email&docs_validated=true',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      expect(res.data as string).not.toContain(atMissingEmail);
    });

    it('CSV NÃO inclui worker sem linha em worker_documents', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email&docs_validated=true',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      expect(res.data as string).not.toContain(noDocsEmail);
    });

    it('resultados do export batem com a lista (mesmos IDs)', async () => {
      // IDs from list endpoint
      const listIds = await listDocsValidated();
      const ourIds = new Set([atFullId, atMissingId, baseFullId, noDocsId]);
      const relevantFromList = listIds.filter((id) => ourIds.has(id)).sort();

      // Emails that appear in the export (only our seeded ones)
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email&docs_validated=true',
        { ...authHeaders(adminToken), responseType: 'text' },
      );
      expect(res.status).toBe(200);
      const body = res.data as string;

      // For each worker in our seeded set: list ↔ export must agree
      const inExport = (email: string) => body.includes(email);

      // atFull appears in list → must appear in export
      if (relevantFromList.includes(atFullId)) {
        expect(inExport(atFullEmail)).toBe(true);
      }
      // atMissing absent from list → must be absent from export
      if (!relevantFromList.includes(atMissingId)) {
        expect(inExport(atMissingEmail)).toBe(false);
      }
      // baseFull appears in list → must appear in export
      if (relevantFromList.includes(baseFullId)) {
        expect(inExport(baseFullEmail)).toBe(true);
      }
      // noDocs absent from list → must be absent from export
      if (!relevantFromList.includes(noDocsId)) {
        expect(inExport(noDocsEmail)).toBe(false);
      }
    });
  });
});
