import { createApiClient, getMockToken, waitForBackend } from './helpers';

describe('Recruitment API', () => {
  const api = createApiClient();
  let authToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    authToken = await getMockToken(api, {
      uid: 'test-admin-e2e',
      email: 'admin@e2e.local',
      role: 'admin',
    });
  });

  function authHeaders() {
    return { headers: { Authorization: `Bearer ${authToken}` } };
  }

  describe('GET /api/admin/recruitment/clickup-cases', () => {
    it('retorna paginação', async () => {
      const res = await api.get(
        '/api/admin/recruitment/clickup-cases?page=1&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination).toHaveProperty('total');
      expect(res.data.pagination).toHaveProperty('page');
      expect(res.data.pagination).toHaveProperty('limit');
      expect(res.data.pagination).toHaveProperty('totalPages');
    });

    it('aceita filtro de status', async () => {
      const res = await api.get(
        '/api/admin/recruitment/clickup-cases?status=BUSQUEDA&page=1&limit=10',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination.limit).toBe(10);
    });

    it('retorna 400 para page=0', async () => {
      const res = await api.get(
        '/api/admin/recruitment/clickup-cases?page=0&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toMatch(/page/i);
    });

    it('retorna 400 para limit=1000', async () => {
      const res = await api.get(
        '/api/admin/recruitment/clickup-cases?page=1&limit=1000',
        authHeaders(),
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toMatch(/limit/i);
    });
  });

  describe('GET /api/admin/recruitment/talentum-workers', () => {
    it('retorna paginação', async () => {
      const res = await api.get(
        '/api/admin/recruitment/talentum-workers?page=1&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/admin/recruitment/progreso', () => {
    it('retorna paginação', async () => {
      const res = await api.get(
        '/api/admin/recruitment/progreso?page=1&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/admin/recruitment/publications', () => {
    it('retorna paginação', async () => {
      const res = await api.get(
        '/api/admin/recruitment/publications?page=1&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/admin/recruitment/encuadres', () => {
    it('retorna paginação', async () => {
      const res = await api.get(
        '/api/admin/recruitment/encuadres?page=1&limit=50',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/admin/recruitment/global-metrics', () => {
    it('retorna métricas globais', async () => {
      const res = await api.get(
        '/api/admin/recruitment/global-metrics',
        authHeaders(),
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('activeCasesCount');
      expect(res.data.data).toHaveProperty('postulantesInTalentumCount');
      expect(res.data.data).toHaveProperty('candidatosEnProgresoCount');
      expect(res.data.data).toHaveProperty('cantidadEncuadres');
      expect(Array.isArray(res.data.data.publicationsByChannel)).toBe(true);
    });
  });

  describe('Controle de acesso', () => {
    it('retorna 401 sem token', async () => {
      const res = await api.get('/api/admin/recruitment/clickup-cases');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para worker tentando acessar endpoint admin', async () => {
      const workerToken = await getMockToken(api, {
        uid: 'test-worker-recruitment',
        email: 'worker@e2e.local',
        role: 'worker',
      });
      const res = await api.get('/api/admin/recruitment/clickup-cases', {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
