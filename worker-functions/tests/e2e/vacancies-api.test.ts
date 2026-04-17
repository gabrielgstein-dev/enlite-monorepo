/**
 * vacancies-api.test.ts
 *
 * Testa o CRUD de vagas (job_postings) via VacanciesController.
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 *
 * Endpoints cobertos:
 *   POST   /api/admin/vacancies
 *   GET    /api/admin/vacancies
 *   GET    /api/admin/vacancies/stats
 *   GET    /api/admin/vacancies/:id
 *   PUT    /api/admin/vacancies/:id
 *   DELETE /api/admin/vacancies/:id
 */

import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('Vacancies API', () => {
  const api = createApiClient();
  let adminToken: string;
  let workerToken: string;
  let pool: Pool;

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'vacancies-admin-e2e',
      email: 'vacancies-admin@e2e.local',
      role: 'admin',
    });

    workerToken = await getMockToken(api, {
      uid: 'vacancies-worker-e2e',
      email: 'vacancies-worker@e2e.local',
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
  // POST /api/admin/vacancies — criar vaga
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /api/admin/vacancies', () => {
    it('cria vaga com campos mínimos → 201 + id retornado', async () => {
      const body = {
        case_number: 99901,
        title: 'Caso E2E Teste',
        worker_profile_sought: 'AT com experiência em adultos mayores',
        schedule_days_hours: 'Lunes a Viernes 08-16hs',
        providers_needed: 1,
      };

      const res = await api.post('/api/admin/vacancies', body, authHeaders(adminToken));

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBeTruthy();
      expect(res.data.data.case_number).toBe(99901);
      expect(res.data.data.status).toBe('BUSQUEDA');
    });

    it('nova vaga aparece no banco com status BUSQUEDA', async () => {
      const body = {
        case_number: 99902,
        title: 'Caso E2E Banco',
      };

      const res = await api.post('/api/admin/vacancies', body, authHeaders(adminToken));
      expect(res.status).toBe(201);

      const { rows } = await pool.query(
        `SELECT id, status, case_number FROM job_postings WHERE id = $1`,
        [res.data.data.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('BUSQUEDA');
      expect(rows[0].case_number).toBe(99902);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.post('/api/admin/vacancies', { case_number: 99999 });
      expect(res.status).toBe(401);
    });

    it('retorna 403 para role worker', async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        { case_number: 99999 },
        authHeaders(workerToken),
      );
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/admin/vacancies — listar vagas
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/admin/vacancies', () => {
    it('retorna lista com estrutura correta', async () => {
      const res = await api.get('/api/admin/vacancies', authHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data).toHaveProperty('total');
      expect(res.data).toHaveProperty('limit');
      expect(res.data).toHaveProperty('offset');
    });

    it('aceita paginação via limit e offset', async () => {
      const res = await api.get(
        '/api/admin/vacancies?limit=5&offset=0',
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(res.data.limit).toBe(5);
      expect(res.data.data.length).toBeLessThanOrEqual(5);
    });

    it('aceita filtro de status', async () => {
      const res = await api.get(
        '/api/admin/vacancies?status=ativo',
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('aceita filtro de busca textual', async () => {
      const res = await api.get(
        '/api/admin/vacancies?search=Caso',
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.get('/api/admin/vacancies');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para role worker', async () => {
      const res = await api.get('/api/admin/vacancies', authHeaders(workerToken));
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/admin/vacancies/stats
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/admin/vacancies/stats', () => {
    it('retorna array de estatísticas', async () => {
      const res = await api.get('/api/admin/vacancies/stats', authHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
      // Espera ao menos os 4 indicadores definidos no controller
      expect(res.data.data.length).toBeGreaterThanOrEqual(4);
      res.data.data.forEach((stat: any) => {
        expect(stat).toHaveProperty('label');
        expect(stat).toHaveProperty('value');
        expect(stat).toHaveProperty('icon');
      });
    });

    it('retorna 401 sem token', async () => {
      const res = await api.get('/api/admin/vacancies/stats');
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/admin/vacancies/:id — detalhe
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/admin/vacancies/:id', () => {
    let createdId: string;

    beforeAll(async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        { case_number: 99903, title: 'Caso E2E Detalhe' },
        authHeaders(adminToken),
      );
      createdId = res.data.data?.id;
    });

    it('retorna detalhes da vaga com encuadres e publications', async () => {
      if (!createdId) return;
      const res = await api.get(
        `/api/admin/vacancies/${createdId}`,
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBe(createdId);
    });

    it('retorna 404 para UUID inexistente', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await api.get(
        `/api/admin/vacancies/${fakeId}`,
        authHeaders(adminToken),
      );
      expect(res.status).toBe(404);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.get(`/api/admin/vacancies/${createdId ?? '00000000-0000-0000-0000-000000000000'}`);
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/vacancies/:id — atualizar
  // ─────────────────────────────────────────────────────────────────────────────
  describe('PUT /api/admin/vacancies/:id', () => {
    let vacancyId: string;

    beforeAll(async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        { case_number: 99904, title: 'Caso E2E Update' },
        authHeaders(adminToken),
      );
      vacancyId = res.data.data?.id;
    });

    it('atualiza campo title → 200 + dado persistido', async () => {
      if (!vacancyId) return;
      const res = await api.put(
        `/api/admin/vacancies/${vacancyId}`,
        { title: 'Título Atualizado E2E' },
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.title).toBe('Título Atualizado E2E');

      // Verifica persistência no banco
      const { rows } = await pool.query(
        `SELECT title FROM job_postings WHERE id = $1`,
        [vacancyId],
      );
      expect(rows[0].title).toBe('Título Atualizado E2E');
    });

    it('retorna 400 quando nenhum campo válido é enviado', async () => {
      if (!vacancyId) return;
      const res = await api.put(
        `/api/admin/vacancies/${vacancyId}`,
        { campo_inexistente: 'valor' },
        authHeaders(adminToken),
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it('retorna 404 para UUID inexistente', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await api.put(
        `/api/admin/vacancies/${fakeId}`,
        { title: 'Qualquer' },
        authHeaders(adminToken),
      );
      expect(res.status).toBe(404);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.put(
        `/api/admin/vacancies/${vacancyId ?? '00000000-0000-0000-0000-000000000000'}`,
        { title: 'X' },
      );
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/vacancies/:id — soft delete
  // ─────────────────────────────────────────────────────────────────────────────
  describe('DELETE /api/admin/vacancies/:id', () => {
    let vacancyId: string;

    beforeAll(async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        { case_number: 99905, title: 'Caso E2E Delete' },
        authHeaders(adminToken),
      );
      vacancyId = res.data.data?.id;
    });

    it('soft-deleta vaga (status → closed) → 200', async () => {
      if (!vacancyId) return;
      const res = await api.delete(
        `/api/admin/vacancies/${vacancyId}`,
        authHeaders(adminToken),
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      // Verifica que status virou 'closed' no banco (soft delete)
      const { rows } = await pool.query(
        `SELECT status FROM job_postings WHERE id = $1`,
        [vacancyId],
      );
      expect(rows[0].status).toBe('closed');
    });

    it('retorna 404 para UUID inexistente', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await api.delete(
        `/api/admin/vacancies/${fakeId}`,
        authHeaders(adminToken),
      );
      expect(res.status).toBe(404);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.delete(
        `/api/admin/vacancies/${vacancyId ?? '00000000-0000-0000-0000-000000000000'}`,
      );
      expect(res.status).toBe(401);
    });

    it('retorna 403 para role worker', async () => {
      const res = await api.delete(
        `/api/admin/vacancies/${vacancyId ?? '00000000-0000-0000-0000-000000000000'}`,
        authHeaders(workerToken),
      );
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Regressão — bugs encontrados em 2026-03-26
  //
  // Cada teste aqui documenta um bug real que foi ao ar. O nome do teste
  // descreve o sintoma original para que a causa seja imediatamente óbvia
  // quando o teste falhar no futuro.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Regressão', () => {
    // ── Bug 1 ─────────────────────────────────────────────────────────────────
    // Sintoma: POST /api/admin/vacancies → 500 "column diagnosis does not exist"
    // Causa:   createVacancy() incluía diagnosis no INSERT de job_postings, mas
    //          a coluna foi movida para patients em migration 039.
    // Fix:     Removido diagnosis do INSERT do controller.
    it('POST sem diagnosis no body não retorna 500 (coluna removida de job_postings em migration 039)', async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        { case_number: 88801, title: 'Regressão Bug 1' },
        authHeaders(adminToken),
      );
      // Antes do fix: 500 com "column diagnosis does not exist"
      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
    });

    it('job_postings não tem coluna diagnosis (pertence a patients desde migration 039)', async () => {
      const { rows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'job_postings'
          AND column_name = 'diagnosis'
      `);
      // Se essa assertion falhar, alguém adicionou diagnosis de volta —
      // o controller precisará ser atualizado junto.
      expect(rows).toHaveLength(0);
    });

    // ── Bug 2 ─────────────────────────────────────────────────────────────────
    // Sintoma: Após criar uma vaga, o servidor caía — todas as requisições
    //          seguintes retornavam ECONNRESET.
    // Causa:   Erros síncronos lançados dentro do callback do setImmediate
    //          (ex: GROQ_API_KEY ausente ao instanciar serviço) se tornavam
    //          exceções não-capturadas que derrubavam o processo Node.js.
    // Fix:     try-catch envolvendo todo o callback do setImmediate.
    it('servidor permanece saudável após criar vaga sem GROQ_API_KEY configurado', async () => {
      // Cria a vaga — dispara o setImmediate com match em background
      const createRes = await api.post(
        '/api/admin/vacancies',
        { case_number: 88802, title: 'Regressão Bug 2' },
        authHeaders(adminToken),
      );
      expect(createRes.status).toBe(201);

      // Aguarda o setImmediate executar (próximo tick do event loop)
      await new Promise(r => setTimeout(r, 200));

      // Antes do fix: /health retornava ECONNRESET porque o processo tinha caído
      const healthRes = await api.get('/health');
      expect(healthRes.status).toBe(200);

      // Garante que a API continua aceitando requests normais
      const listRes = await api.get('/api/admin/vacancies', authHeaders(adminToken));
      expect(listRes.status).toBe(200);
    });

    // ── Bug 3 ─────────────────────────────────────────────────────────────────
    // Sintoma: GET /api/admin/vacancies/:id retornava data.id = null para vagas
    //          sem paciente associado.
    // Causa:   SELECT jp.*, p.* — quando p.patient_id é NULL, p.id (NULL)
    //          sobrescrevia jp.id no objeto retornado pelo driver do Postgres.
    // Fix:     Substituído p.* por campos nomeados com aliases explícitos;
    //          adicionado jp.id as id para garantir precedência.
    it('GET /:id retorna o id da vaga, não do paciente (jp.id não sobrescrito por p.id)', async () => {
      // Cria vaga SEM patient_id — o cenário que expunha o bug
      const createRes = await api.post(
        '/api/admin/vacancies',
        { case_number: 88803, title: 'Regressão Bug 3 — sem paciente' },
        authHeaders(adminToken),
      );
      expect(createRes.status).toBe(201);
      const vacancyId = createRes.data.data.id as string;
      expect(vacancyId).toBeTruthy();

      const getRes = await api.get(
        `/api/admin/vacancies/${vacancyId}`,
        authHeaders(adminToken),
      );
      expect(getRes.status).toBe(200);
      // Antes do fix: getRes.data.data.id era null (p.id sobrescrevia jp.id)
      expect(getRes.data.data.id).toBe(vacancyId);
    });

    // ── Bug 4 ─────────────────────────────────────────────────────────────────
    // Sintoma: POST /api/admin/vacancies → 500 "null value in column description
    //          violates not-null constraint"
    // Causa:   description TEXT NOT NULL desde migration 011. Vagas criadas via
    //          UI não têm descrição livre no momento da criação.
    // Fix:     Migration 058 tornou description nullable.
    it('POST sem description não retorna 500 (description é nullable desde migration 058)', async () => {
      const res = await api.post(
        '/api/admin/vacancies',
        // Intencionalmente omite description
        { case_number: 88804, title: 'Regressão Bug 4 — sem description' },
        authHeaders(adminToken),
      );
      // Antes do fix: 500 com "null value in column description..."
      expect(res.status).toBe(201);
    });

    it('description é nullable em job_postings (migration 058)', async () => {
      const { rows } = await pool.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'job_postings'
          AND column_name = 'description'
      `);
      expect(rows).toHaveLength(1);
      // Se essa assertion falhar, alguém reverteu a migration 058 ou recriou
      // a coluna como NOT NULL — o controller precisa fornecer um default.
      expect(rows[0].is_nullable).toBe('YES');
    });
  });
});
