import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

/**
 * E2E Tests: PATCH /api/admin/users/:id/role
 *
 * Validates:
 * 1. Admin can update another staff member's role
 * 2. Invalid role values are rejected with 400
 * 3. Role update is reflected in users.department (via change_user_role function)
 * 4. Non-admin users cannot change roles (403)
 * 5. Updating to the same role returns 400
 * 6. Updating a non-existent user returns 400
 */
describe('Admin Role Update E2E — PATCH /api/admin/users/:id/role', () => {
  let api: AxiosInstance;
  let db: Pool;
  let adminToken: string;
  let workerToken: string;

  // UID of a seeded test staff member that we will mutate
  const TEST_STAFF_UID = 'e2e-role-update-staff-uid';
  const TEST_STAFF_EMAIL = 'e2e-role-update@e2e.local';

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    db = new Pool({ connectionString: DATABASE_URL });

    await waitForBackend();

    adminToken = await generateToken('test-admin-uid', 'test-admin@e2e.local', 'admin');
    workerToken = await generateToken('test-worker-uid', 'test-worker@e2e.local', 'worker');

    // Seed a recruiter user that we'll change roles on
    await db.query(`
      INSERT INTO users (firebase_uid, email, display_name, role, is_active)
      VALUES ($1, $2, 'E2E Role Update User', 'recruiter', true)
      ON CONFLICT (firebase_uid) DO UPDATE
        SET role = 'recruiter', email = EXCLUDED.email, display_name = EXCLUDED.display_name
    `, [TEST_STAFF_UID, TEST_STAFF_EMAIL]);
  });

  afterAll(async () => {
    // Cleanup seeded user
    await db.query(`DELETE FROM users WHERE firebase_uid = $1`, [TEST_STAFF_UID]);
    await db.end();
  });

  async function waitForBackend(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await api.get('/health');
        if (res.status === 200) return;
      } catch (_) {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Backend not ready after max retries');
  }

  async function generateToken(uid: string, email: string, role: string): Promise<string> {
    const res = await api.post('/api/test/auth/token', { uid, email, role });
    return res.data.data.token;
  }

  describe('Authorization', () => {
    it('should return 401 when no token provided', async () => {
      const res = await api.patch(`/api/admin/users/${TEST_STAFF_UID}/role`, {
        role: 'community_manager',
      });
      expect(res.status).toBe(401);
    });

    it('should return 403 when worker tries to update a role', async () => {
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        { role: 'community_manager' },
        { headers: { Authorization: `Bearer ${workerToken}` } }
      );
      expect(res.status).toBe(403);
    });
  });

  describe('Validation', () => {
    it('should return 400 when role is missing', async () => {
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it('should return 400 when role is not a valid staff role', async () => {
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        { role: 'worker' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it('should return 400 when user already has the target role', async () => {
      // TEST_STAFF_UID was seeded as 'recruiter'
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        { role: 'recruiter' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toMatch(/already has this role/i);
    });

    it('should return 400 when user does not exist', async () => {
      const res = await api.patch(
        '/api/admin/users/non-existent-uid-xyz/role',
        { role: 'community_manager' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  describe('Successful role update', () => {
    it('should update recruiter → community_manager and return the updated record', async () => {
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        { role: 'community_manager', department: 'Operaciones' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data.role).toBe('community_manager');
      expect(data.firebaseUid).toBe(TEST_STAFF_UID);

      // Confirm DB was updated
      const dbRow = await db.query(
        `SELECT role, department FROM users WHERE firebase_uid = $1`,
        [TEST_STAFF_UID]
      );
      expect(dbRow.rows[0].role).toBe('community_manager');
      expect(dbRow.rows[0].department).toBe('Operaciones');
    });

    it('should be able to update community_manager → admin', async () => {
      // After previous test, user is community_manager
      const res = await api.patch(
        `/api/admin/users/${TEST_STAFF_UID}/role`,
        { role: 'admin' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.data.role).toBe('admin');

      const dbRow = await db.query(
        `SELECT role FROM users WHERE firebase_uid = $1`,
        [TEST_STAFF_UID]
      );
      expect(dbRow.rows[0].role).toBe('admin');
    });
  });

  describe('users table: department / last_login_at / login_count columns', () => {
    it('users table should have department column after migration 134', async () => {
      const res = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'department'
      `);
      expect(res.rows.length).toBe(1);
    });

    it('users table should have last_login_at column after migration 134', async () => {
      const res = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'last_login_at'
      `);
      expect(res.rows.length).toBe(1);
    });

    it('users table should have login_count column after migration 134', async () => {
      const res = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'login_count'
      `);
      expect(res.rows.length).toBe(1);
    });
  });
});
