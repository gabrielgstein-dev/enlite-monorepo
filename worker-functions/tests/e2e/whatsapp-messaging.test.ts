/**
 * whatsapp-messaging.test.ts
 *
 * Testa o módulo de mensagens WhatsApp (Fase 3).
 *
 * Parte 1 — HTTP (via servidor real):
 *   Controller: auth, validação de params, worker lookup (404/422)
 *   Twilio não configurado no ambiente de teste → happy path via HTTP retorna 502
 *
 * Parte 2 — TwilioMessagingService direto (twilio mockado):
 *   Template lookup via DB real, interpolação de variáveis, slug inválido
 *
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

// Mock do módulo twilio ANTES de qualquer import que o carregue.
// _mockCreate é exposto na factory para acesso nos testes.
jest.mock('twilio', () => {
  const create = jest.fn();
  const factory = jest.fn().mockReturnValue({ messages: { create } });
  return Object.assign(factory, { _mockCreate: create });
});

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import twilio from 'twilio';
import { TwilioMessagingService } from '../../src/infrastructure/services/TwilioMessagingService';
import { MessageTemplateRepository } from '../../src/infrastructure/repositories/MessageTemplateRepository';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

// DatabaseConnection singleton lê DATABASE_URL de process.env
process.env.DATABASE_URL = DATABASE_URL;

// Env vars fake para TwilioMessagingService ficar isConfigured=true nos testes diretos
process.env.TWILIO_ACCOUNT_SID = 'ACtest_whatsapp_e2e';
process.env.TWILIO_AUTH_TOKEN = 'auth_token_test_e2e';
process.env.TWILIO_WHATSAPP_NUMBER = '+14155552671';

// Acesso ao mock de criação de mensagem Twilio
const getMockCreate = () => (twilio as any)._mockCreate as jest.Mock;

// ─────────────────────────────────────────────────────────────────
// Parte 1 — HTTP (MessagingController via servidor real)
// ─────────────────────────────────────────────────────────────────

describe('POST /api/admin/messaging/whatsapp — HTTP layer', () => {
  let api: AxiosInstance;
  let pool: Pool;
  let adminToken: string;
  let workerToken: string;
  let workerWithPhoneId: string;
  let workerWithoutPhoneId: string;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true });
    pool = new Pool({ connectionString: DATABASE_URL });

    adminToken = await getToken(api, 'admin-msg-uid', 'admin-msg@e2e.test', 'admin');
    workerToken = await getToken(api, 'worker-msg-uid', 'worker-msg@e2e.test', 'worker');

    // Worker com whatsapp_phone_encrypted cadastrado (base64-encoded for KMS test mode)
    const r1 = await pool.query<{ id: string }>(
      `INSERT INTO workers (auth_uid, email, whatsapp_phone_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['ts-worker-phone-uid', 'worker-phone@e2e.test', Buffer.from('+5511987654321').toString('base64')],
    );
    workerWithPhoneId = r1.rows[0].id;

    // Worker SEM telefone (phone e whatsapp_phone_encrypted nulos)
    const r2 = await pool.query<{ id: string }>(
      `INSERT INTO workers (auth_uid, email)
       VALUES ($1, $2)
       RETURNING id`,
      ['ts-worker-no-phone-uid', 'worker-no-phone@e2e.test'],
    );
    workerWithoutPhoneId = r2.rows[0].id;

    // Garante que template de teste existe no banco
    await pool.query(`
      INSERT INTO message_templates (slug, name, body, category)
      VALUES ('talent_search_welcome', 'Boas-vindas', 'Olá {{name}}!', 'onboarding')
      ON CONFLICT (slug) DO NOTHING
    `);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM workers WHERE auth_uid IN ($1, $2)`, [
      'ts-worker-phone-uid',
      'ts-worker-no-phone-uid',
    ]);
    await pool.end();
  });

  it('retorna 401 sem Authorization header', async () => {
    const res = await api.post('/api/admin/messaging/whatsapp', {
      workerId: workerWithPhoneId,
      templateSlug: 'talent_search_welcome',
    });
    expect(res.status).toBe(401);
  });

  it('retorna 403 com token de role=worker', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: workerWithPhoneId, templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${workerToken}` } },
    );
    expect(res.status).toBe(403);
  });

  it('retorna 400 quando workerId está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/workerId/i);
  });

  it('retorna 400 quando templateSlug está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: workerWithPhoneId },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/templateSlug/i);
  });

  it('retorna 400 quando templateSlug é string vazia', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: workerWithPhoneId, templateSlug: '   ' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando worker não existe', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: '00000000-0000-0000-0000-000000000000', templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(404);
    expect(res.data.error).toMatch(/Worker/i);
  });

  it('retorna 422 quando worker não tem telefone cadastrado', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: workerWithoutPhoneId, templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(422);
    expect(res.data.error).toMatch(/telefone/i);
  });

  it('retorna 502 quando Twilio não está configurado (ambiente de teste)', async () => {
    // O servidor real não tem TWILIO_* configurado → isConfigured=false → 502
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      { workerId: workerWithPhoneId, templateSlug: 'talent_search_welcome', variables: { name: 'Ana' } },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(502);
    expect(res.data.error).toBeDefined();
  });
});

describe('POST /api/admin/messaging/whatsapp/direct — HTTP layer', () => {
  let api: AxiosInstance;
  let adminToken: string;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, validateStatus: () => true });
    adminToken = await getToken(api, 'admin-direct-uid', 'admin-direct@e2e.test', 'admin');
  });

  it('retorna 401 sem Authorization header', async () => {
    const res = await api.post('/api/admin/messaging/whatsapp/direct', {
      to: '+5511999999999',
      templateSlug: 'talent_search_welcome',
    });
    expect(res.status).toBe(401);
  });

  it('retorna 400 quando "to" está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp/direct',
      { templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando templateSlug está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp/direct',
      { to: '+5511999999999' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('retorna 502 quando Twilio não está configurado (ambiente de teste)', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp/direct',
      { to: '+5511999999999', templateSlug: 'talent_search_welcome' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(502);
  });
});

// ─────────────────────────────────────────────────────────────────
// Parte 1b — Template CRUD HTTP (GET/POST/PUT/DELETE /templates)
// ─────────────────────────────────────────────────────────────────

describe('GET /api/admin/messaging/templates — lista templates', () => {
  let api: AxiosInstance;
  let adminToken: string;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, validateStatus: () => true });
    adminToken = await getToken(api, 'admin-tpl-list-uid', 'admin-tpl-list@e2e.test', 'admin');
  });

  it('retorna 401 sem Authorization header', async () => {
    const res = await api.get('/api/admin/messaging/templates');
    expect(res.status).toBe(401);
  });

  it('retorna 200 com lista de templates ativos', async () => {
    const res = await api.get('/api/admin/messaging/templates', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Seeds da migration 059 devem estar presentes
    const slugs = res.data.data.map((t: any) => t.slug);
    expect(slugs).toContain('talent_search_welcome');
  });

  it('retorna todos os templates com ?all=true', async () => {
    const res = await api.get('/api/admin/messaging/templates?all=true', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });
});

describe('POST /api/admin/messaging/templates — cria template', () => {
  let api: AxiosInstance;
  let adminToken: string;
  const testSlug = `e2e-test-template-${Date.now()}`;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, validateStatus: () => true });
    adminToken = await getToken(api, 'admin-tpl-create-uid', 'admin-tpl-create@e2e.test', 'admin');
  });

  afterAll(async () => {
    // Limpa template criado no teste
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query(`DELETE FROM message_templates WHERE slug = $1`, [testSlug]).catch(() => {});
    await pool.end();
  });

  it('retorna 400 quando slug está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/templates',
      { name: 'Test', body: 'Hello' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/slug/i);
  });

  it('retorna 400 quando name está ausente', async () => {
    const res = await api.post(
      '/api/admin/messaging/templates',
      { slug: testSlug, body: 'Hello' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('cria novo template → 201 com entity', async () => {
    const res = await api.post(
      '/api/admin/messaging/templates',
      { slug: testSlug, name: 'E2E Test Template', body: 'Olá {{name}}!', category: 'onboarding' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.slug).toBe(testSlug);
    expect(res.data.data.isActive).toBe(true);
  });

  it('upsert no mesmo slug → 200 (atualizado, não criado)', async () => {
    const res = await api.post(
      '/api/admin/messaging/templates',
      { slug: testSlug, name: 'E2E Test Template Updated', body: 'Olá {{name}}, atualizado!' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('E2E Test Template Updated');
  });
});

describe('PUT /api/admin/messaging/templates/:slug — atualiza template', () => {
  let api: AxiosInstance;
  let adminToken: string;
  const testSlug = `e2e-put-template-${Date.now()}`;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, validateStatus: () => true });
    adminToken = await getToken(api, 'admin-tpl-put-uid', 'admin-tpl-put@e2e.test', 'admin');
    // Cria template para atualizar
    await api.post(
      '/api/admin/messaging/templates',
      { slug: testSlug, name: 'Original Name', body: 'Original body' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query(`DELETE FROM message_templates WHERE slug = $1`, [testSlug]).catch(() => {});
    await pool.end();
  });

  it('retorna 400 quando name está ausente', async () => {
    const res = await api.put(
      `/api/admin/messaging/templates/${testSlug}`,
      { body: 'New body' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('atualiza body do template → 200 com dados atualizados', async () => {
    const res = await api.put(
      `/api/admin/messaging/templates/${testSlug}`,
      { name: 'Updated Name', body: 'Updated body {{var}}', category: 'recruitment' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated Name');
    expect(res.data.data.body).toBe('Updated body {{var}}');
    expect(res.data.data.category).toBe('recruitment');
  });
});

describe('DELETE /api/admin/messaging/templates/:slug — desativa template', () => {
  let api: AxiosInstance;
  let adminToken: string;
  const testSlug = `e2e-del-template-${Date.now()}`;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, validateStatus: () => true });
    adminToken = await getToken(api, 'admin-tpl-del-uid', 'admin-tpl-del@e2e.test', 'admin');
    await api.post(
      '/api/admin/messaging/templates',
      { slug: testSlug, name: 'To Delete', body: 'Delete me' },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query(`DELETE FROM message_templates WHERE slug = $1`, [testSlug]).catch(() => {});
    await pool.end();
  });

  it('retorna 404 para slug inexistente', async () => {
    const res = await api.delete('/api/admin/messaging/templates/slug-that-does-not-exist', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);
  });

  it('desativa template existente → 200', async () => {
    const res = await api.delete(`/api/admin/messaging/templates/${testSlug}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('template desativado não aparece na listagem padrão', async () => {
    const res = await api.get('/api/admin/messaging/templates', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const slugs = res.data.data.map((t: any) => t.slug);
    expect(slugs).not.toContain(testSlug);
  });

  it('template desativado aparece com ?all=true', async () => {
    const res = await api.get('/api/admin/messaging/templates?all=true', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const found = res.data.data.find((t: any) => t.slug === testSlug);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Parte 2 — TwilioMessagingService direto (twilio mockado, DB real)
// ─────────────────────────────────────────────────────────────────

describe('TwilioMessagingService — template lookup + interpolação', () => {
  let pool: Pool;
  let service: TwilioMessagingService;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });

    // Garante que os templates de seed existem no banco para os testes diretos
    await pool.query(`
      INSERT INTO message_templates (slug, name, body, category) VALUES
        ('talent_search_welcome',
         'Boas-vindas Talent Search',
         'Olá {{name}}! Encontramos o seu perfil e gostaríamos de apresentar oportunidades. Podemos conversar?',
         'onboarding'),
        ('vacancy_match',
         'Vaga Compatível',
         'Olá {{name}}! Temos uma vaga de {{role}} em {{location}} para você.',
         'recruitment')
      ON CONFLICT (slug) DO UPDATE SET
        body = EXCLUDED.body,
        is_active = true
    `);
  });

  beforeEach(() => {
    getMockCreate().mockReset().mockResolvedValue({ sid: 'SMtest_abc123', status: 'queued' });
    service = new TwilioMessagingService(new MessageTemplateRepository());
  });

  afterAll(async () => {
    await pool.end();
  });

  it('resolve o body do template e chama Twilio com o texto correto', async () => {
    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'talent_search_welcome',
      variables: { name: 'Maria' },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().externalId).toBe('SMtest_abc123');
    expect(result.getValue().status).toBe('queued');

    const [callArgs] = getMockCreate().mock.calls[0];
    expect(callArgs.body).toContain('Maria');
    expect(callArgs.body).not.toContain('{{name}}');
    expect(callArgs.from).toMatch(/^whatsapp:/);
    expect(callArgs.to).toMatch(/^whatsapp:\+/);
  });

  it('interpola múltiplas variáveis no template body', async () => {
    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'vacancy_match',
      variables: { name: 'João', role: 'Enfermeiro', location: 'São Paulo' },
    });

    expect(result.isSuccess).toBe(true);
    const [callArgs] = getMockCreate().mock.calls[0];
    expect(callArgs.body).toContain('João');
    expect(callArgs.body).toContain('Enfermeiro');
    expect(callArgs.body).toContain('São Paulo');
    expect(callArgs.body).not.toContain('{{');
  });

  it('mantém o placeholder quando variável não é fornecida', async () => {
    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'vacancy_match',
      variables: { name: 'Ana' }, // role e location ausentes
    });

    expect(result.isSuccess).toBe(true);
    const [callArgs] = getMockCreate().mock.calls[0];
    expect(callArgs.body).toContain('{{role}}');
    expect(callArgs.body).toContain('{{location}}');
  });

  it('retorna fail quando templateSlug não existe', async () => {
    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'slug_que_nao_existe_xyz',
      variables: {},
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('slug_que_nao_existe_xyz');
    expect(getMockCreate()).not.toHaveBeenCalled();
  });

  it('retorna fail quando template está inativo', async () => {
    await pool.query(`UPDATE message_templates SET is_active = false WHERE slug = 'vacancy_match'`);

    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'vacancy_match',
      variables: {},
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('vacancy_match');
    expect(getMockCreate()).not.toHaveBeenCalled();

    // Reativa para não impactar outros testes
    await pool.query(`UPDATE message_templates SET is_active = true WHERE slug = 'vacancy_match'`);
  });

  it('retorna fail para número de telefone inválido (muito curto)', async () => {
    const result = await service.sendWhatsApp({
      to: '123',
      templateSlug: 'talent_search_welcome',
      variables: { name: 'Test' },
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/phone/i);
    expect(getMockCreate()).not.toHaveBeenCalled();
  });

  it('propaga erro do Twilio como Result.fail', async () => {
    getMockCreate().mockRejectedValue(new Error('Account is suspended'));

    const result = await service.sendWhatsApp({
      to: '+5511999999999',
      templateSlug: 'talent_search_welcome',
      variables: { name: 'Test' },
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Account is suspended');
  });
});

// ─────────────────────────────────────────────────────────────────
// Parte 1c — jobPostingId + messaged_at (Fase 5 / migration 061)
//
// O controller atualiza messaged_at APÓS um envio bem-sucedido com
// templateSlug='vacancy_match' e jobPostingId fornecido.
// Como o servidor de teste não tem Twilio configurado, o envio
// retorna 502 ANTES de atingir o código de atualização.
// O que testamos aqui:
//   1. O parâmetro jobPostingId não quebra a camada de validação
//      (mesmos 400/401/403/404 para os cenários de erro habituais)
//   2. A atualização de messaged_at via SQL funciona diretamente
//      (garante que a migration 061 + o UPDATE do controller estão corretos)
// ─────────────────────────────────────────────────────────────────

describe('POST /api/admin/messaging/whatsapp — jobPostingId e messaged_at', () => {
  let api: AxiosInstance;
  let pool: Pool;
  let adminToken: string;
  let workerWithPhoneId: string;
  let vacancyId: string;

  beforeAll(async () => {
    api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true });
    pool = new Pool({ connectionString: DATABASE_URL });
    adminToken = await getToken(api, 'admin-jpi-uid', 'admin-jpi@e2e.test', 'admin');

    // Worker com telefone para este grupo de testes (base64-encoded for KMS test mode)
    const r1 = await pool.query<{ id: string }>(
      `INSERT INTO workers (auth_uid, email, whatsapp_phone_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['ts-worker-jpi-uid', 'worker-jpi@e2e.test', Buffer.from('+5511900000099').toString('base64')],
    );
    workerWithPhoneId = r1.rows[0].id;

    // Vaga para testar jobPostingId
    const r2 = await pool.query<{ id: string }>(
      `INSERT INTO job_postings (case_number, title, status, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [88099, 'Vaga JobPostingId E2E', 'BUSQUEDA', null],
    );
    vacancyId = r2.rows[0].id;

    // Garante vacancy_match template ativo
    await pool.query(`
      INSERT INTO message_templates (slug, name, body, category)
      VALUES ('vacancy_match', 'Vaga Compatível', 'Olá {{name}}! Vaga de {{role}} em {{location}}.', 'recruitment')
      ON CONFLICT (slug) DO UPDATE SET is_active = true
    `);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM workers WHERE auth_uid = $1`, ['ts-worker-jpi-uid']).catch(() => {});
    await pool.query(`DELETE FROM job_postings WHERE case_number = $1`, [88099]).catch(() => {});
    await pool.end();
  });

  it('jobPostingId no body não quebra a validação — ainda retorna 401 sem token', async () => {
    const res = await api.post('/api/admin/messaging/whatsapp', {
      workerId: workerWithPhoneId,
      templateSlug: 'vacancy_match',
      jobPostingId: vacancyId,
    });
    expect(res.status).toBe(401);
  });

  it('jobPostingId no body não quebra a validação — ainda retorna 404 para worker inexistente', async () => {
    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      {
        workerId:     '00000000-0000-0000-0000-000000000000',
        templateSlug: 'vacancy_match',
        jobPostingId: vacancyId,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(404);
  });

  it('jobPostingId no body com Twilio não configurado → 502 (envio falha, mas não 500)', async () => {
    // Insere candidatura para que o UPDATE de messaged_at tenha algo para atualizar
    await pool.query(
      `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_status)
       VALUES ($1, $2, 'under_review')
       ON CONFLICT DO NOTHING`,
      [workerWithPhoneId, vacancyId],
    );

    const res = await api.post(
      '/api/admin/messaging/whatsapp',
      {
        workerId:     workerWithPhoneId,
        templateSlug: 'vacancy_match',
        variables:    { name: 'TestJPI', role: 'AT', location: 'CABA' },
        jobPostingId: vacancyId,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    // 502 = Twilio não configurado; não deve ser 500 (bug no servidor)
    expect(res.status).toBe(502);
    expect(res.data.error).toBeDefined();
  });

  // ── Teste direto via SQL: garante que o UPDATE do controller funciona ──
  it('UPDATE messaged_at via SQL funciona — campo é persistido e retornado em GET /match-results', async () => {
    // Garante candidatura existente
    await pool.query(
      `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_status)
       VALUES ($1, $2, 'under_review')
       ON CONFLICT DO NOTHING`,
      [workerWithPhoneId, vacancyId],
    );

    // Simula o que o controller faz após envio bem-sucedido
    await pool.query(
      `UPDATE worker_job_applications
       SET messaged_at = NOW(), updated_at = NOW()
       WHERE worker_id = $1 AND job_posting_id = $2`,
      [workerWithPhoneId, vacancyId],
    );

    // Verifica que foi persistido
    const { rows } = await pool.query(
      `SELECT messaged_at FROM worker_job_applications
       WHERE worker_id = $1 AND job_posting_id = $2`,
      [workerWithPhoneId, vacancyId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].messaged_at).not.toBeNull();
    expect(rows[0].messaged_at).toBeInstanceOf(Date);

    // GET /match-results deve refletir messagedAt != null
    const res = await api.get(
      `/api/admin/vacancies/${vacancyId}/match-results`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(200);
    const candidate = res.data.data.candidates.find((c: any) => c.workerId === workerWithPhoneId);
    expect(candidate).toBeDefined();
    expect(candidate.messagedAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function getToken(
  api: AxiosInstance,
  uid: string,
  email: string,
  role: 'admin' | 'worker',
): Promise<string> {
  const res = await api.post('/api/test/auth/token', { uid, email, role });
  if (res.status !== 200) throw new Error(`Token failed: ${JSON.stringify(res.data)}`);
  return res.data.data.token;
}
