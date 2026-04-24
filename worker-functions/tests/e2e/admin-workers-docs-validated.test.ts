/**
 * admin-workers-docs-validated.test.ts
 *
 * Testa os filtros docs_validated=all_validated e docs_validated=pending_validation
 * nos endpoints de listagem e export de workers.
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 *
 * Endpoints cobertos:
 *   GET /api/admin/workers?docs_validated=all_validated
 *   GET /api/admin/workers?docs_validated=pending_validation
 *   GET /api/admin/workers/export?docs_validated=all_validated&format=csv&columns=email
 *   GET /api/admin/workers/export?docs_validated=pending_validation&format=csv&columns=email
 *
 * Cenários all_validated:
 *   1. Worker AT com as 8 keys validadas → retornado
 *   2. Worker AT com 7 keys (falta at_certificate) → NÃO retornado
 *   3. Worker base (profession = null) com 6 keys validadas → retornado
 *   4. Worker sem linha em worker_documents → NÃO retornado
 *   5. Combinação com case_id → aplica AND corretamente
 *   6. Export também respeita o filtro
 *
 * Cenários pending_validation:
 *   7. Worker AT com 7/8 → aparece em pending, NÃO em all_validated
 *   8. Worker base com 5/6 → aparece em pending
 *   9. Worker sem linha worker_documents → aparece em pending
 *  10. Worker AT completo (8/8) → NÃO aparece em pending
 *  11. Combinação docs_complete=complete AND pending_validation → cadastro completo mas validação pendente
 *  12. Export com pending_validation retorna mesmo conjunto da lista
 *
 * Validação de schema:
 *  13. docs_validated=true (valor antigo) → 400 Bad Request
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

/** 5 of 6 base slugs (missing liability_insurance). */
const BASE_FIVE_SLUGS = BASE_SLUGS.filter((s) => s !== 'liability_insurance');

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
  let atFullId: string;         // AT with all 8 slugs — all_validated: YES, pending: NO
  let atMissingId: string;      // AT missing at_certificate — all_validated: NO, pending: YES
  let baseFullId: string;       // non-AT with 6 base slugs — all_validated: YES, pending: NO
  let baseMissingId: string;    // non-AT with 5/6 slugs — all_validated: NO, pending: YES
  let noDocsId: string;         // no worker_documents row — all_validated: NO, pending: YES

  // Unique emails so we can verify presence/absence in CSV body
  const ts = Date.now();
  const atFullEmail = `dv-at-full-${ts}@e2e.local`;
  const atMissingEmail = `dv-at-missing-${ts}@e2e.local`;
  const baseFullEmail = `dv-base-full-${ts}@e2e.local`;
  const baseMissingEmail = `dv-base-missing-${ts}@e2e.local`;
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

    // 3. Base worker (profession = null) — all 6 base slugs validated
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

    // 4. Base worker — 5/6 slugs (missing liability_insurance)
    const r4 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, NULL, 'REGISTERED') RETURNING id`,
      [`dv-base-missing-${ts}`, baseMissingEmail],
    );
    baseMissingId = r4.rows[0].id;
    await pool.query(
      `INSERT INTO worker_documents (worker_id, document_validations)
       VALUES ($1, $2::jsonb)`,
      [baseMissingId, JSON.stringify(makeValidations(BASE_FIVE_SLUGS))],
    );

    // 5. Worker without any worker_documents row
    const r5 = await pool.query(
      `INSERT INTO workers (auth_uid, email, profession, status)
       VALUES ($1, $2, NULL, 'REGISTERED') RETURNING id`,
      [`dv-no-docs-${ts}`, noDocsEmail],
    );
    noDocsId = r5.rows[0].id;
    // Intentionally no worker_documents insert
  });

  afterAll(async () => {
    if (!pool) return;
    const ids = [atFullId, atMissingId, baseFullId, baseMissingId, noDocsId].filter(Boolean);
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
  async function listWithFilter(docsValidated: string, extra = ''): Promise<string[]> {
    const res = await api.get(
      `/api/admin/workers?docs_validated=${docsValidated}&limit=1000${extra}`,
      authHeaders(adminToken),
    );
    expect(res.status).toBe(200);
    return (res.data.data as { id: string }[]).map((w) => w.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bloco A — all_validated
  // ═══════════════════════════════════════════════════════════════════════════

  describe('docs_validated=all_validated', () => {
    // ── 1. AT worker with all 8 slugs → INCLUDED ─────────────────────────────
    it('AT worker com todas as 8 chaves validadas é retornado', async () => {
      const ids = await listWithFilter('all_validated');
      expect(ids).toContain(atFullId);
    });

    // ── 2. AT worker missing at_certificate → EXCLUDED ───────────────────────
    it('AT worker sem at_certificate NÃO é retornado', async () => {
      const ids = await listWithFilter('all_validated');
      expect(ids).not.toContain(atMissingId);
    });

    // ── 3. Base worker (profession = null) with 6 slugs → INCLUDED ───────────
    it('Worker base com as 6 chaves validadas é retornado', async () => {
      const ids = await listWithFilter('all_validated');
      expect(ids).toContain(baseFullId);
    });

    // ── 4. Worker without worker_documents row → EXCLUDED ────────────────────
    it('Worker sem linha em worker_documents NÃO é retornado', async () => {
      const ids = await listWithFilter('all_validated');
      expect(ids).not.toContain(noDocsId);
    });

    // ── 5. Combination with case_id filter ────────────────────────────────────
    it('combinação com case_id inexistente retorna lista vazia (AND aplicado corretamente)', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const ids = await listWithFilter('all_validated', `&case_id=${fakeUuid}`);
      expect(ids).not.toContain(atFullId);
      expect(ids).not.toContain(baseFullId);
    });

    // ── 6. Export endpoint — docs_validated=all_validated ─────────────────────
    describe('GET /api/admin/workers/export?docs_validated=all_validated', () => {
      it('CSV inclui worker AT completo e worker base completo', async () => {
        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=all_validated',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        const body = res.data as string;
        expect(body).toContain(atFullEmail);
        expect(body).toContain(baseFullEmail);
      });

      it('CSV NÃO inclui AT com chave faltando', async () => {
        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=all_validated',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        expect(res.data as string).not.toContain(atMissingEmail);
      });

      it('CSV NÃO inclui worker sem linha em worker_documents', async () => {
        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=all_validated',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        expect(res.data as string).not.toContain(noDocsEmail);
      });

      it('resultados do export batem com a lista (mesmos IDs)', async () => {
        const listIds = await listWithFilter('all_validated');
        const ourIds = new Set([atFullId, atMissingId, baseFullId, baseMissingId, noDocsId]);
        const relevantFromList = listIds.filter((id) => ourIds.has(id)).sort();

        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=all_validated',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        const body = res.data as string;

        const inExport = (email: string) => body.includes(email);

        if (relevantFromList.includes(atFullId)) expect(inExport(atFullEmail)).toBe(true);
        if (!relevantFromList.includes(atMissingId)) expect(inExport(atMissingEmail)).toBe(false);
        if (relevantFromList.includes(baseFullId)) expect(inExport(baseFullEmail)).toBe(true);
        if (!relevantFromList.includes(noDocsId)) expect(inExport(noDocsEmail)).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Bloco B — pending_validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('docs_validated=pending_validation', () => {
    // ── 7. AT worker com 7/8 → aparece em pending, NÃO em all_validated ──────
    it('AT worker com 7/8 slugs aparece em pending_validation', async () => {
      const ids = await listWithFilter('pending_validation');
      expect(ids).toContain(atMissingId);
    });

    it('AT worker com 7/8 slugs NÃO aparece em all_validated', async () => {
      const ids = await listWithFilter('all_validated');
      expect(ids).not.toContain(atMissingId);
    });

    // ── 8. Worker base com 5/6 slugs → aparece em pending ────────────────────
    it('Worker base com 5/6 slugs aparece em pending_validation', async () => {
      const ids = await listWithFilter('pending_validation');
      expect(ids).toContain(baseMissingId);
    });

    // ── 9. Worker sem linha worker_documents → aparece em pending ──────────────
    it('Worker sem linha em worker_documents aparece em pending_validation', async () => {
      const ids = await listWithFilter('pending_validation');
      expect(ids).toContain(noDocsId);
    });

    // ── 10. AT completo (8/8) → NÃO aparece em pending ───────────────────────
    it('AT worker completo (8/8) NÃO aparece em pending_validation', async () => {
      const ids = await listWithFilter('pending_validation');
      expect(ids).not.toContain(atFullId);
    });

    // ── 11. docs_complete=complete AND pending_validation ─────────────────────
    it('combinação docs_complete=complete AND pending_validation retorna cadastros completos com validação pendente', async () => {
      // atMissingId and baseMissingId have status=REGISTERED (docs_complete=complete)
      // but are missing required slugs (pending_validation).
      const res = await api.get(
        '/api/admin/workers?docs_complete=complete&docs_validated=pending_validation&limit=1000',
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      const ids = (res.data.data as { id: string }[]).map((w) => w.id);
      expect(ids).toContain(atMissingId);
      expect(ids).toContain(baseMissingId);
      // fully validated workers must NOT appear
      expect(ids).not.toContain(atFullId);
      expect(ids).not.toContain(baseFullId);
    });

    // ── 12. Export com pending_validation bate com a lista ────────────────────
    describe('GET /api/admin/workers/export?docs_validated=pending_validation', () => {
      it('CSV inclui workers com validação pendente', async () => {
        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=pending_validation',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        const body = res.data as string;
        expect(body).toContain(atMissingEmail);
        expect(body).toContain(baseMissingEmail);
        expect(body).toContain(noDocsEmail);
      });

      it('CSV NÃO inclui workers com validação completa', async () => {
        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=pending_validation',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        const body = res.data as string;
        expect(body).not.toContain(atFullEmail);
        expect(body).not.toContain(baseFullEmail);
      });

      it('resultados do export batem com a lista pending_validation', async () => {
        const listIds = await listWithFilter('pending_validation');
        const ourIds = new Set([atFullId, atMissingId, baseFullId, baseMissingId, noDocsId]);
        const relevantFromList = listIds.filter((id) => ourIds.has(id));

        const res = await api.get(
          '/api/admin/workers/export?format=csv&columns=email&docs_validated=pending_validation',
          { ...authHeaders(adminToken), responseType: 'text' },
        );
        expect(res.status).toBe(200);
        const body = res.data as string;

        const inExport = (email: string) => body.includes(email);

        // pending workers must appear in both list and export
        if (relevantFromList.includes(atMissingId)) expect(inExport(atMissingEmail)).toBe(true);
        if (relevantFromList.includes(baseMissingId)) expect(inExport(baseMissingEmail)).toBe(true);
        if (relevantFromList.includes(noDocsId)) expect(inExport(noDocsEmail)).toBe(true);
        // validated workers must appear in neither
        if (!relevantFromList.includes(atFullId)) expect(inExport(atFullEmail)).toBe(false);
        if (!relevantFromList.includes(baseFullId)) expect(inExport(baseFullEmail)).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Bloco C — validação de schema (valor inválido)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validação de schema', () => {
    // ── 13. docs_validated=true (valor legado) → 400 ──────────────────────────
    it('docs_validated=true retorna 400 Bad Request', async () => {
      const res = await api.get(
        '/api/admin/workers?docs_validated=true',
        { ...authHeaders(adminToken), validateStatus: () => true },
      );
      expect(res.status).toBe(400);
    });

    it('docs_validated=invalid retorna 400 Bad Request', async () => {
      const res = await api.get(
        '/api/admin/workers?docs_validated=invalid',
        { ...authHeaders(adminToken), validateStatus: () => true },
      );
      expect(res.status).toBe(400);
    });

    it('export com docs_validated=true retorna 400 Bad Request', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email&docs_validated=true',
        { ...authHeaders(adminToken), validateStatus: () => true, responseType: 'json' },
      );
      expect(res.status).toBe(400);
    });
  });
});
