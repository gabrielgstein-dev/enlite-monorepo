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

    // Worker com whatsapp_phone cadastrado
    const r1 = await pool.query<{ id: string }>(
      `INSERT INTO workers (auth_uid, full_name, email, whatsapp_phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['ts-worker-phone-uid', 'Worker Com Phone', 'worker-phone@e2e.test', '+5511987654321'],
    );
    workerWithPhoneId = r1.rows[0].id;

    // Worker SEM telefone (phone e whatsapp_phone nulos)
    const r2 = await pool.query<{ id: string }>(
      `INSERT INTO workers (auth_uid, full_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['ts-worker-no-phone-uid', 'Worker Sem Phone', 'worker-no-phone@e2e.test'],
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
