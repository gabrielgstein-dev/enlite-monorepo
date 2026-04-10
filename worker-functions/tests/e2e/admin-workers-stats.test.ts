/**
 * admin-workers-stats.test.ts
 *
 * Testa o endpoint GET /api/admin/workers/stats que retorna
 * contagem de registros: hoje, ontem e últimos 7 dias.
 *
 * Insere workers com created_at controlado e valida que o
 * campo sevenDaysAgo usa range (>=), não dia exato.
 */

import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';
import { randomUUID } from 'crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('Admin Workers Stats API', () => {
  const api = createApiClient();
  let adminToken: string;
  let workerToken: string;
  let pool: Pool;
  const insertedWorkerIds: string[] = [];

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'stats-admin-e2e',
      email: 'stats-admin@e2e.local',
      role: 'admin',
    });

    workerToken = await getMockToken(api, {
      uid: 'stats-worker-e2e',
      email: 'stats-worker@e2e.local',
      role: 'worker',
    });

    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    // Limpar workers inseridos pelo teste
    if (insertedWorkerIds.length > 0) {
      await pool.query(
        `DELETE FROM workers WHERE id = ANY($1::uuid[])`,
        [insertedWorkerIds],
      );
    }
    if (pool) await pool.end();
  });

  function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  /**
   * Insere um worker com created_at específico para controlar as contagens.
   * Retorna o id do worker inserido.
   */
  async function insertWorkerAt(daysAgo: number): Promise<string> {
    const id = randomUUID();
    const suffix = id.slice(0, 8);
    const email = `stats-test-${suffix}@e2e.local`;
    const authUid = `stats-e2e-${suffix}`;
    await pool.query(
      `INSERT INTO workers (id, auth_uid, email, status, created_at)
       VALUES ($1, $2, $3, 'REGISTERED',
         (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' - ($4 || ' days')::interval)
           AT TIME ZONE 'America/Sao_Paulo')`,
      [id, authUid, email, daysAgo.toString()],
    );
    insertedWorkerIds.push(id);
    return id;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/admin/workers/stats
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/workers/stats', () => {
    it('retorna estrutura correta com today, yesterday e sevenDaysAgo', async () => {
      const res = await api.get('/api/admin/workers/stats', authHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('today');
      expect(res.data.data).toHaveProperty('yesterday');
      expect(res.data.data).toHaveProperty('sevenDaysAgo');
      expect(typeof res.data.data.today).toBe('number');
      expect(typeof res.data.data.yesterday).toBe('number');
      expect(typeof res.data.data.sevenDaysAgo).toBe('number');
    });

    it('sevenDaysAgo conta todos os registros dos últimos 7 dias (não apenas dia exato)', async () => {
      // Captura stats ANTES de inserir workers de teste
      const before = await api.get('/api/admin/workers/stats', authHeaders(adminToken));
      const baseToday = before.data.data.today;
      const baseYesterday = before.data.data.yesterday;
      const baseSeven = before.data.data.sevenDaysAgo;

      // Insere workers em diferentes dias dentro da janela de 7 dias
      await insertWorkerAt(0); // hoje       → impacta today + sevenDaysAgo
      await insertWorkerAt(1); // ontem      → impacta yesterday + sevenDaysAgo
      await insertWorkerAt(3); // 3 dias     → impacta apenas sevenDaysAgo
      await insertWorkerAt(5); // 5 dias     → impacta apenas sevenDaysAgo
      await insertWorkerAt(7); // 7 dias     → impacta apenas sevenDaysAgo (borda)

      // Worker fora da janela — NÃO deve contar em sevenDaysAgo
      await insertWorkerAt(8); // 8 dias atrás → fora da janela

      const after = await api.get('/api/admin/workers/stats', authHeaders(adminToken));

      // today: +1 (o worker de daysAgo=0)
      expect(after.data.data.today).toBe(baseToday + 1);

      // yesterday: +1 (o worker de daysAgo=1)
      expect(after.data.data.yesterday).toBe(baseYesterday + 1);

      // sevenDaysAgo: +5 (dias 0,1,3,5,7 — todos dentro da janela de 7 dias)
      // O worker de 8 dias atrás NÃO deve ser incluído
      expect(after.data.data.sevenDaysAgo).toBe(baseSeven + 5);
    });

    it('exclui workers merged (merged_into_id IS NOT NULL)', async () => {
      const id = await insertWorkerAt(0); // hoje

      const before = await api.get('/api/admin/workers/stats', authHeaders(adminToken));
      const todayBefore = before.data.data.today;

      // Marca o worker como merged
      await pool.query(
        `UPDATE workers SET merged_into_id = $1 WHERE id = $1`,
        [id],
      );

      const after = await api.get('/api/admin/workers/stats', authHeaders(adminToken));

      // O worker merged não deve contar mais
      expect(after.data.data.today).toBe(todayBefore - 1);

      // Limpar: desfazer merge para o afterAll deletar corretamente
      await pool.query(
        `UPDATE workers SET merged_into_id = NULL WHERE id = $1`,
        [id],
      );
    });

    it('retorna 401 sem token de autenticação', async () => {
      const res = await api.get('/api/admin/workers/stats');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para role worker (apenas staff tem acesso)', async () => {
      const res = await api.get('/api/admin/workers/stats', authHeaders(workerToken));
      expect(res.status).toBe(403);
    });
  });
});
