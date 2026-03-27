/**
 * import-history.test.ts
 *
 * Testa GET /api/import/history com paginação e filtro de status.
 *
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

import { createApiClient, getMockToken, waitForBackend } from './helpers';

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/import/history — paginação', () => {
  const api = createApiClient();
  let adminToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'history-admin-e2e',
      email: 'history@e2e.local',
      role: 'admin',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('estrutura da resposta', () => {
    it('retorna { success, data[], pagination } no formato correto', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);

      const p = res.data.pagination;
      expect(typeof p.page).toBe('number');
      expect(typeof p.limit).toBe('number');
      expect(typeof p.total).toBe('number');
      expect(typeof p.totalPages).toBe('number');
      expect(typeof p.hasNext).toBe('boolean');
      expect(typeof p.hasPrev).toBe('boolean');
    });

    it('cada item contém os campos esperados', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      if (res.data.data.length === 0) return; // banco vazio — pula

      const item = res.data.data[0] as Record<string, unknown>;
      expect(typeof item.id).toBe('string');
      expect(typeof item.filename).toBe('string');
      expect(typeof item.status).toBe('string');
      expect(typeof item.currentPhase).toBe('string');
      expect('createdAt' in item).toBe(true);
      expect('workersCreated' in item).toBe(true);
      expect('encuadresCreated' in item).toBe(true);
      expect('errorRows' in item).toBe(true);
      expect('duration' in item).toBe(true);
      expect('cancelledAt' in item).toBe(true);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.get('/api/import/history');
      expect(res.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('defaults', () => {
    it('page padrão é 1', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.data.pagination.page).toBe(1);
    });

    it('limit padrão é 20', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.data.pagination.limit).toBe(20);
    });

    it('data.length <= limit', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const { data, pagination } = res.data;
      expect(data.length).toBeLessThanOrEqual(pagination.limit);
    });

    it('hasPrev é false na primeira página', async () => {
      const res = await api.get('/api/import/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.data.pagination.hasPrev).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('parâmetro limit', () => {
    it('?limit=5 retorna no máximo 5 itens', async () => {
      const res = await api.get('/api/import/history?limit=5', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.data.length).toBeLessThanOrEqual(5);
      expect(res.data.pagination.limit).toBe(5);
    });

    it('?limit=1 retorna no máximo 1 item', async () => {
      const res = await api.get('/api/import/history?limit=1', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.data.length).toBeLessThanOrEqual(1);
    });

    it('?limit=101 retorna 400 (acima do máximo)', async () => {
      const res = await api.get('/api/import/history?limit=101', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('?limit=0 retorna 400 (abaixo do mínimo)', async () => {
      const res = await api.get('/api/import/history?limit=0', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('parâmetro page', () => {
    it('?page=1 é equivalente ao default', async () => {
      const [resDefault, resPage1] = await Promise.all([
        api.get('/api/import/history?limit=5', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        api.get('/api/import/history?page=1&limit=5', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      ]);
      expect(resDefault.data.pagination.page).toBe(resPage1.data.pagination.page);
      expect(resDefault.data.data).toEqual(resPage1.data.data);
    });

    it('?page=0 retorna 400', async () => {
      const res = await api.get('/api/import/history?page=0', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('página 2 retorna itens diferentes da página 1', async () => {
      const [res1, res2] = await Promise.all([
        api.get('/api/import/history?page=1&limit=1', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        api.get('/api/import/history?page=2&limit=1', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      ]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      if (res1.data.data.length > 0 && res2.data.data.length > 0) {
        expect(res1.data.data[0].id).not.toBe(res2.data.data[0].id);
      }
    });

    it('página além do total retorna data vazia (não 404)', async () => {
      const res = await api.get('/api/import/history?page=9999&limit=20', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.data).toEqual([]);
    });

    it('hasNext é false na última página', async () => {
      // Busca a última página usando totalPages
      const first = await api.get('/api/import/history?limit=20', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const { totalPages } = first.data.pagination as Record<string, number>;
      if (totalPages < 1) return; // banco vazio

      const last = await api.get(`/api/import/history?page=${totalPages}&limit=20`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(last.data.pagination.hasNext).toBe(false);
    });

    it('hasPrev é true em páginas > 1', async () => {
      const first = await api.get('/api/import/history?limit=20', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (first.data.pagination.total <= 20) return; // não há página 2

      const second = await api.get('/api/import/history?page=2&limit=20', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(second.data.pagination.hasPrev).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('filtro ?status=', () => {
    it('?status=done retorna apenas jobs com status done', async () => {
      const res = await api.get('/api/import/history?status=done&limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      for (const item of res.data.data as Record<string, unknown>[]) {
        expect(item.status).toBe('done');
      }
    });

    it('?status=error retorna apenas jobs com status error', async () => {
      const res = await api.get('/api/import/history?status=error&limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      for (const item of res.data.data as Record<string, unknown>[]) {
        expect(item.status).toBe('error');
      }
    });

    it('?status=cancelled retorna apenas jobs cancelados', async () => {
      const res = await api.get('/api/import/history?status=cancelled&limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      for (const item of res.data.data as Record<string, unknown>[]) {
        expect(item.status).toBe('cancelled');
      }
    });

    it('?status inválido retorna 400', async () => {
      const res = await api.get('/api/import/history?status=invalid_status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('total do filtro é <= total geral', async () => {
      const [resAll, resDone] = await Promise.all([
        api.get('/api/import/history', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        api.get('/api/import/history?status=done', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      ]);
      expect(resDone.data.pagination.total).toBeLessThanOrEqual(
        resAll.data.pagination.total,
      );
    });

    it('total filtrado + paginação são consistentes', async () => {
      const res = await api.get('/api/import/history?status=done&limit=3', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const { data, pagination } = res.data;
      expect(data.length).toBeLessThanOrEqual(3);

      const expectedTotalPages = Math.ceil(pagination.total / 3);
      expect(pagination.totalPages).toBe(expectedTotalPages);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('ordenação', () => {
    it('retorna jobs em ordem decrescente de createdAt', async () => {
      const res = await api.get('/api/import/history?limit=10', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const dates = (res.data.data as Record<string, unknown>[])
        .map(item => new Date(item.createdAt as string).getTime());

      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });
});
