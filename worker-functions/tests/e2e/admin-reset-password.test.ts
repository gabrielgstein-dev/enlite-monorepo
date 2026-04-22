import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

/**
 * E2E Tests: POST /api/admin/users/:id/reset-password
 *
 * Validates the invitation-link reset flow (migration 135):
 * 1. Non-admin gets 403
 * 2. Unauthenticated request gets 401
 * 3. Admin calling reset for unknown UID gets 400
 * 4. POST /api/admin/auth/change-password no longer exists (404)
 */
describe('Admin Reset Password E2E — POST /api/admin/users/:id/reset-password', () => {
  let api: AxiosInstance;
  let db: Pool;
  let adminToken: string;
  let workerToken: string;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    db = new Pool({ connectionString: DATABASE_URL });

    await waitForBackend();
    adminToken = await generateToken('test-admin-uid', 'admin');
    workerToken = await generateToken('test-worker-uid', 'worker');
  });

  afterAll(async () => {
    await db.end();
  });

  async function waitForBackend(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const r = await api.get('/health');
        if (r.status === 200) return;
      } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Backend not ready after max retries');
  }

  async function generateToken(uid: string, role: string): Promise<string> {
    const r = await api.post('/api/test/auth/token', { uid, email: `${uid}@e2e.local`, role });
    return r.data.data.token;
  }

  describe('Access control', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await api.post('/api/admin/users/some-uid/reset-password');
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it('deve retornar 403 para worker autenticado', async () => {
      const res = await api.post(
        '/api/admin/users/some-uid/reset-password',
        {},
        { headers: { Authorization: `Bearer ${workerToken}` } }
      );
      expect(res.status).toBe(403);
      expect(res.data.success).toBe(false);
    });
  });

  describe('Admin chamando reset para UID inexistente', () => {
    it('deve retornar 400 quando o Firebase UID não existe', async () => {
      const res = await api.post(
        '/api/admin/users/uid-que-nao-existe-xyzabc/reset-password',
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      // Firebase will throw when getUser is called with an unknown UID
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  describe('Endpoint legado removido (migration 135)', () => {
    it('POST /api/admin/auth/change-password deve retornar 404 — rota foi removida', async () => {
      const res = await api.post(
        '/api/admin/auth/change-password',
        { newPassword: 'SomePass123' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(404);
    });
  });
});
