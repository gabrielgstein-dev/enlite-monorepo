/**
 * admin-workers-export.test.ts
 *
 * E2E tests for GET /api/admin/workers/export.
 * Uses MockAuth (USE_MOCK_AUTH=true) — no real Firebase.
 *
 * Scenarios:
 *   1. Admin + valid CSV params → 200, correct Content-Type / Content-Disposition, header row present
 *   2. Admin + XLSX → 200, XLSX MIME type
 *   3. Non-admin (staff/community_manager role) → 403
 *   4. Unknown column → 400
 *   5. Status filter → only workers with that status appear in the body
 */

import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('GET /api/admin/workers/export', () => {
  const api = createApiClient();
  let adminToken: string;
  let staffToken: string;
  let pool: Pool;

  // Workers seeded for this test suite
  let registeredWorkerId: string;
  let incompleteWorkerId: string;
  const registeredEmail = `export-registered-${Date.now()}@e2e.local`;
  const incompleteEmail = `export-incomplete-${Date.now()}@e2e.local`;

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'export-admin-e2e',
      email: 'export-admin@e2e.local',
      role: 'admin',
    });

    // staff role is allowed to list workers but NOT to export (export is admin-only)
    staffToken = await getMockToken(api, {
      uid: 'export-staff-e2e',
      email: 'export-staff@e2e.local',
      role: 'staff',
    });

    pool = new Pool({ connectionString: DATABASE_URL });

    // Seed a REGISTERED worker directly in the DB (status already set)
    const encFirstName = Buffer.from('ExportNombre', 'utf8').toString('base64');
    const encLastName = Buffer.from('ExportApellido', 'utf8').toString('base64');

    const regResult = await pool.query(
      `INSERT INTO workers (auth_uid, email, first_name_encrypted, last_name_encrypted, status, country)
       VALUES ($1, $2, $3, $4, 'REGISTERED', 'AR')
       RETURNING id`,
      [`export-reg-${Date.now()}`, registeredEmail, encFirstName, encLastName],
    );
    registeredWorkerId = regResult.rows[0].id;

    const incResult = await pool.query(
      `INSERT INTO workers (auth_uid, email, first_name_encrypted, last_name_encrypted, status, country)
       VALUES ($1, $2, $3, $4, 'INCOMPLETE_REGISTER', 'AR')
       RETURNING id`,
      [`export-inc-${Date.now()}`, incompleteEmail, encFirstName, encLastName],
    );
    incompleteWorkerId = incResult.rows[0].id;
  });

  afterAll(async () => {
    if (pool) {
      if (registeredWorkerId) {
        await pool.query('DELETE FROM worker_service_areas WHERE worker_id = $1', [registeredWorkerId]);
        await pool.query('DELETE FROM workers WHERE id = $1', [registeredWorkerId]);
      }
      if (incompleteWorkerId) {
        await pool.query('DELETE FROM worker_service_areas WHERE worker_id = $1', [incompleteWorkerId]);
        await pool.query('DELETE FROM workers WHERE id = $1', [incompleteWorkerId]);
      }
      await pool.end();
    }
  });

  function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  // ── 1. CSV — happy path ───────────────────────────────────────────────────

  describe('CSV format (valid request)', () => {
    it('retorna 200 com Content-Type text/csv', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=first_name,last_name,email,status',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/i);
    });

    it('Content-Disposition inclui filename com extensão .csv', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email,status',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const disposition = res.headers['content-disposition'] ?? '';
      expect(disposition).toMatch(/attachment/i);
      expect(disposition).toMatch(/\.csv/i);
    });

    it('body começa com a linha de cabeçalho CSV com as colunas solicitadas', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=first_name,email,status',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const lines: string[] = (res.data as string).split('\r\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      // First line must be the header with translated ES-AR labels (not DB keys)
      expect(lines[0]).toBe('Nombre,Correo electrónico,Estado');
    });

    it('body contém linha de dados do worker REGISTERED seedado', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email,status&status=REGISTERED',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const body = res.data as string;
      expect(body).toContain(registeredEmail);
    });
  });

  // ── 2. XLSX — happy path ──────────────────────────────────────────────────

  describe('XLSX format (valid request)', () => {
    it('retorna 200 com Content-Type XLSX', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=xlsx&columns=first_name,last_name,email',
        { ...authHeaders(adminToken), responseType: 'arraybuffer' },
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i,
      );
    });

    it('Content-Disposition inclui filename com extensão .xlsx', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=xlsx&columns=email',
        { ...authHeaders(adminToken), responseType: 'arraybuffer' },
      );

      expect(res.status).toBe(200);
      const disposition = res.headers['content-disposition'] ?? '';
      expect(disposition).toMatch(/\.xlsx/i);
    });

    it('body é um buffer binário não-vazio', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=xlsx&columns=email,status',
        { ...authHeaders(adminToken), responseType: 'arraybuffer' },
      );

      expect(res.status).toBe(200);
      // XLSX files start with PK (ZIP magic bytes: 0x50 0x4B)
      const buf = Buffer.from(res.data as ArrayBuffer);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf[0]).toBe(0x50); // 'P'
      expect(buf[1]).toBe(0x4b); // 'K'
    });
  });

  // ── 3. Access control ─────────────────────────────────────────────────────

  describe('access control', () => {
    it('retorna 403 para role staff (apenas admin tem acesso ao export)', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email',
        authHeaders(staffToken),
      );

      expect(res.status).toBe(403);
    });

    it('retorna 401 sem token de autenticação', async () => {
      const res = await api.get('/api/admin/workers/export?format=csv&columns=email');
      expect(res.status).toBe(401);
    });
  });

  // ── 4. Validation errors ──────────────────────────────────────────────────

  describe('validação de params', () => {
    it('retorna 400 para formato desconhecido', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=pdf&columns=email',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(400);
    });

    it('retorna 400 para coluna desconhecida', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email,coluna_invalida_xyz',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/unknown columns/i);
    });

    it('retorna 400 quando columns está ausente', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(400);
    });
  });

  // ── 5. Status filter ──────────────────────────────────────────────────────

  describe('filtro por status', () => {
    it('com status=REGISTERED, resposta não contém worker INCOMPLETE_REGISTER seedado', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email,status&status=REGISTERED',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const body = res.data as string;
      expect(body).not.toContain(incompleteEmail);
    });

    it('com status=INCOMPLETE_REGISTER, resposta não contém worker REGISTERED seedado', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email,status&status=INCOMPLETE_REGISTER',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const body = res.data as string;
      expect(body).not.toContain(registeredEmail);
    });

    it('sem filtro de status, resposta contém ambos os workers seedados', async () => {
      const res = await api.get(
        '/api/admin/workers/export?format=csv&columns=email',
        { ...authHeaders(adminToken), responseType: 'text' },
      );

      expect(res.status).toBe(200);
      const body = res.data as string;
      expect(body).toContain(registeredEmail);
      expect(body).toContain(incompleteEmail);
    });
  });
});
