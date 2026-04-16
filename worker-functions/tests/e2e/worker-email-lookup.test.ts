/**
 * E2E: GET /api/workers/lookup
 *
 * Endpoint público que consulta a tabela workers por email e retorna
 * { found: boolean, phoneMasked?: string }.
 *
 * phoneMasked expõe apenas os últimos 3 dígitos; o restante é mascarado com 'x'.
 * Nenhum dado sensível (id, email, authUid, firstName, lastName) é retornado.
 */

import { Pool } from 'pg';
import { createApiClient, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('GET /api/workers/lookup', () => {
  const api = createApiClient();
  let pool: Pool;

  const SUFFIX = `lookup-e2e-${Date.now()}`;
  const EMAIL_WITH_PHONE = `with-phone-${SUFFIX}@test.com`;
  const EMAIL_WITHOUT_PHONE = `without-phone-${SUFFIX}@test.com`;

  let workerWithPhoneId: string;
  let workerWithoutPhoneId: string;

  beforeAll(async () => {
    await waitForBackend(api);

    pool = new Pool({ connectionString: DATABASE_URL });

    // Inserir worker com phone
    const withPhone = await pool.query(
      `INSERT INTO workers (email, phone, country)
       VALUES ($1, $2, 'BR')
       RETURNING id`,
      [EMAIL_WITH_PHONE, '+5511987650978'],
    );
    workerWithPhoneId = withPhone.rows[0].id as string;

    // Inserir worker sem phone
    const withoutPhone = await pool.query(
      `INSERT INTO workers (email, phone, country)
       VALUES ($1, NULL, 'BR')
       RETURNING id`,
      [EMAIL_WITHOUT_PHONE],
    );
    workerWithoutPhoneId = withoutPhone.rows[0].id as string;
  });

  afterAll(async () => {
    if (workerWithPhoneId) {
      await pool.query('DELETE FROM workers WHERE id = $1', [workerWithPhoneId]).catch(() => {});
    }
    if (workerWithoutPhoneId) {
      await pool.query('DELETE FROM workers WHERE id = $1', [workerWithoutPhoneId]).catch(() => {});
    }
    if (pool) await pool.end();
  });

  // ── Cenário 1: Worker com phone ──────────────────────────────────────────────

  describe('Cenário 1 — Worker encontrado com phone', () => {
    it('retorna 200 com found: true e phoneMasked correto', async () => {
      const res = await api.get(`/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITH_PHONE)}`);

      expect(res.status).toBe(200);
      expect(res.data.found).toBe(true);
      // Phone = '+5511987650978' (14 chars) → últimos 3 = '978' → 11 x's + '978'
      expect(res.data.phoneMasked).toBe('xxxxxxxxxxx978');
    });

    it('phoneMasked contém exatamente os últimos 3 dígitos visíveis', async () => {
      const res = await api.get(`/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITH_PHONE)}`);

      const masked: string = res.data.phoneMasked;
      const originalPhone = '+5511987650978';
      const lastThree = originalPhone.slice(-3);
      const expectedX = 'x'.repeat(originalPhone.length - 3);

      expect(masked).toBe(expectedX + lastThree);
    });

    it('response contém SOMENTE as keys "found" e "phoneMasked" — sem vazamento de dados sensíveis', async () => {
      const res = await api.get(`/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITH_PHONE)}`);

      const keys = Object.keys(res.data);
      expect(keys).toEqual(expect.arrayContaining(['found', 'phoneMasked']));
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('email');
      expect(keys).not.toContain('authUid');
      expect(keys).not.toContain('firstName');
      expect(keys).not.toContain('lastName');
      expect(keys.length).toBe(2);
    });
  });

  // ── Cenário 2: Worker sem phone ──────────────────────────────────────────────

  describe('Cenário 2 — Worker encontrado sem phone', () => {
    it('retorna 200 com found: true e sem phoneMasked', async () => {
      const res = await api.get(
        `/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITHOUT_PHONE)}`,
      );

      expect(res.status).toBe(200);
      expect(res.data.found).toBe(true);
      expect(res.data.phoneMasked).toBeUndefined();
    });

    it('response contém SOMENTE a key "found" — sem vazamento de dados sensíveis', async () => {
      const res = await api.get(
        `/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITHOUT_PHONE)}`,
      );

      const keys = Object.keys(res.data);
      expect(keys).toEqual(['found']);
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('email');
      expect(keys).not.toContain('authUid');
      expect(keys).not.toContain('firstName');
      expect(keys).not.toContain('lastName');
    });
  });

  // ── Cenário 3: Email inexistente ─────────────────────────────────────────────

  describe('Cenário 3 — Email inexistente', () => {
    it('retorna 200 com found: false', async () => {
      const res = await api.get('/api/workers/lookup?email=naoexiste@test.com');

      expect(res.status).toBe(200);
      expect(res.data.found).toBe(false);
    });

    it('response contém SOMENTE a key "found"', async () => {
      const res = await api.get('/api/workers/lookup?email=naoexiste@test.com');

      const keys = Object.keys(res.data);
      expect(keys).toEqual(['found']);
    });
  });

  // ── Cenário 4: Email ausente (sem query param) ───────────────────────────────

  describe('Cenário 4 — Parâmetro email ausente', () => {
    it('retorna 400', async () => {
      const res = await api.get('/api/workers/lookup');

      expect(res.status).toBe(400);
    });
  });

  // ── Cenário 5: Email inválido ────────────────────────────────────────────────

  describe('Cenário 5 — Email com formato inválido', () => {
    it('retorna 400 para string sem @ e sem .', async () => {
      const res = await api.get('/api/workers/lookup?email=invalido');

      expect(res.status).toBe(400);
    });

    it('retorna 400 para string com @ mas sem domínio completo', async () => {
      const res = await api.get('/api/workers/lookup?email=invalido@');

      expect(res.status).toBe(400);
    });
  });

  // ── Cenário 7: Rate limiting — 429 após 10 requisições por minuto ───────────

  describe('Cenário 7 — Rate limiting', () => {
    it('retorna 429 quando o limite de 10 req/min é excedido', async () => {
      // Dispara 11 requests sequenciais isolados neste teste.
      // O rate limit é 10 req/min por IP; pelo menos a 11ª deve retornar 429.
      const responses: number[] = [];

      for (let i = 0; i < 11; i++) {
        const res = await api.get('/api/workers/lookup?email=ratelimit@test.com');
        responses.push(res.status);
      }

      expect(responses).toContain(429);
    });
  });

  // ── Cenário 6: Segurança — nenhum dado sensível em nenhum cenário ────────────

  describe('Cenário 6 — Garantia de segurança em todos os cenários found: true', () => {
    const sensitiveKeys = ['id', 'email', 'authUid', 'auth_uid', 'firstName', 'first_name',
      'lastName', 'last_name', 'documentNumber', 'document_number', 'phone'];

    it('worker com phone não vaza dados sensíveis', async () => {
      const res = await api.get(
        `/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITH_PHONE)}`,
      );

      expect(res.data.found).toBe(true);
      for (const key of sensitiveKeys) {
        expect(Object.keys(res.data)).not.toContain(key);
      }
    });

    it('worker sem phone não vaza dados sensíveis', async () => {
      const res = await api.get(
        `/api/workers/lookup?email=${encodeURIComponent(EMAIL_WITHOUT_PHONE)}`,
      );

      expect(res.data.found).toBe(true);
      for (const key of sensitiveKeys) {
        expect(Object.keys(res.data)).not.toContain(key);
      }
    });
  });
});
