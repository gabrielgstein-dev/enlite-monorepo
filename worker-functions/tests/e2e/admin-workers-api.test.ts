/**
 * admin-workers-api.test.ts
 *
 * Testa o endpoint de listagem de workers no painel admin.
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 *
 * Endpoints cobertos:
 *   GET /api/admin/workers
 */

import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('Admin Workers API', () => {
  const api = createApiClient();
  let adminToken: string;
  let workerToken: string;
  let pool: Pool;

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'workers-admin-e2e',
      email: 'workers-admin@e2e.local',
      role: 'admin',
    });

    workerToken = await getMockToken(api, {
      uid: 'workers-worker-e2e',
      email: 'workers-worker@e2e.local',
      role: 'worker',
    });

    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/admin/workers — listar workers
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/admin/workers', () => {
    it('retorna estrutura correta com data, total, limit e offset', async () => {
      const res = await api.get('/api/admin/workers', authHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data).toHaveProperty('total');
      expect(res.data).toHaveProperty('limit');
      expect(res.data).toHaveProperty('offset');
    });

    it('cada worker retornado tem os campos obrigatórios', async () => {
      const res = await api.get('/api/admin/workers?limit=5', authHeaders(adminToken));

      expect(res.status).toBe(200);
      res.data.data.forEach((worker: any) => {
        expect(worker).toHaveProperty('id');
        expect(worker).toHaveProperty('name');
        expect(worker).toHaveProperty('email');
        expect(worker).toHaveProperty('casesCount');
        expect(worker).toHaveProperty('documentsComplete');
        expect(worker).toHaveProperty('documentsStatus');
        expect(worker).toHaveProperty('platform');
        expect(worker).toHaveProperty('createdAt');
        expect(typeof worker.casesCount).toBe('number');
        expect(typeof worker.documentsComplete).toBe('boolean');
      });
    });

    it('aceita paginação via limit e offset', async () => {
      const res = await api.get(
        '/api/admin/workers?limit=5&offset=0',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      expect(res.data.limit).toBe(5);
      expect(res.data.offset).toBe(0);
      expect(res.data.data.length).toBeLessThanOrEqual(5);
    });

    it('aceita filtro por plataforma talentum', async () => {
      const res = await api.get(
        '/api/admin/workers?platform=talentum',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      // Todos os workers retornados devem ser da plataforma talentum
      res.data.data.forEach((w: any) => {
        expect(w.platform).toBe('talentum');
      });
    });

    it('aceita filtro por plataforma enlite_app', async () => {
      const res = await api.get(
        '/api/admin/workers?platform=enlite_app',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      res.data.data.forEach((w: any) => {
        expect(w.platform).toBe('enlite_app');
      });
    });

    it('aceita filtro docs_complete=complete', async () => {
      const res = await api.get(
        '/api/admin/workers?docs_complete=complete',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      // Todos devem ter documentsComplete = true
      res.data.data.forEach((w: any) => {
        expect(w.documentsComplete).toBe(true);
      });
    });

    it('aceita filtro docs_complete=incomplete', async () => {
      const res = await api.get(
        '/api/admin/workers?docs_complete=incomplete',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      // Todos devem ter documentsComplete = false
      res.data.data.forEach((w: any) => {
        expect(w.documentsComplete).toBe(false);
      });
    });

    it('workers estão ordenados por created_at DESC (mais recentes primeiro)', async () => {
      const res = await api.get(
        '/api/admin/workers?limit=10',
        authHeaders(adminToken),
      );

      expect(res.status).toBe(200);
      const workers = res.data.data;
      if (workers.length < 2) return; // sem dados suficientes para ordenação

      for (let i = 0; i < workers.length - 1; i++) {
        const dateA = new Date(workers[i].createdAt).getTime();
        const dateB = new Date(workers[i + 1].createdAt).getTime();
        expect(dateA).toBeGreaterThanOrEqual(dateB);
      }
    });

    it('total reflete o número real de workers no banco (excluindo merged)', async () => {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total FROM workers WHERE merged_into_id IS NULL`,
      );
      const dbTotal = parseInt(rows[0].total, 10);

      const res = await api.get(
        '/api/admin/workers?limit=1000',
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(dbTotal);
    });

    it('retorna 401 sem token de autenticação', async () => {
      const res = await api.get('/api/admin/workers');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para role worker (apenas admin tem acesso)', async () => {
      const res = await api.get('/api/admin/workers', authHeaders(workerToken));
      expect(res.status).toBe(403);
    });
  });
});
