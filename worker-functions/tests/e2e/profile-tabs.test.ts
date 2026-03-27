/**
 * E2E: Profile Tabs — novos endpoints por aba
 *
 * Testa os endpoints:
 *   PUT /api/workers/me/general-info
 *   PUT /api/workers/me/service-area
 *   PUT /api/workers/me/availability
 *
 * Esses endpoints usam o authUid do token (header x-auth-uid) para resolver
 * o workerId, sem exigir que o cliente envie workerId no body.
 */

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('Profile Tabs — Endpoints por aba', () => {
  let api: AxiosInstance;
  let db: Pool;
  let workerId: string;
  let mockToken: string;
  const testAuthUid = `profile-tabs-test-${Date.now()}`;
  const testEmail = `profile-tabs-${Date.now()}@example.com`;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    db = new Pool({ connectionString: DATABASE_URL });

    await waitForBackend();

    // Criar worker para os testes (rota pública, não precisa de token)
    const res = await api.post('/api/workers/init', {
      authUid: testAuthUid,
      email: testEmail,
      country: 'AR',
    });
    workerId = res.data.data.id;

    // Gerar token mock para requests autenticados
    const tokenRes = await api.post('/api/test/auth/token', {
      uid: testAuthUid,
      email: testEmail,
      role: 'worker',
    });
    mockToken = tokenRes.data.data.token;
  });

  afterAll(async () => {
    if (workerId) {
      await db.query('DELETE FROM workers WHERE id = $1', [workerId]);
    }
    await db.end();
  });

  async function waitForBackend(maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await api.get('/health');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Backend not ready after 30 seconds');
  }

  function authHeaders() {
    return { headers: { Authorization: `Bearer ${mockToken}` } };
  }

  // ──────────────────────────────────────────────
  // PUT /api/workers/me/general-info
  // ──────────────────────────────────────────────
  describe('PUT /api/workers/me/general-info', () => {
    const payload = {
      firstName: 'Gabriel',
      lastName: 'Stein',
      sex: 'male',
      gender: 'male',
      birthDate: '1990-04-18',
      documentType: 'DNI',
      documentNumber: '12345678',
      phone: '+5491199999999',
      languages: ['pt', 'es'],
      profession: 'CARER',
      knowledgeLevel: 'technical',
      titleCertificate: 'Cert XYZ',
      experienceTypes: ['adhd'],
      yearsExperience: '3_5',
      preferredTypes: ['adhd'],
      preferredAgeRange: 'adolescents',
      termsAccepted: true,
      privacyAccepted: true,
    };

    it('deve retornar 200 e success: true', async () => {
      const res = await api.put('/api/workers/me/general-info', payload, authHeaders());

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.message).toBe('General info saved');
    });

    it('deve ter salvo profissão e anos de experiência', async () => {
      const res = await db.query(
        'SELECT profession, years_experience FROM workers WHERE id = $1',
        [workerId],
      );
      expect(res.rows[0].profession).toBe('CARER');
      expect(res.rows[0].years_experience).toBe('3_5');
    });

    it('deve ter salvo phone na coluna plaintext', async () => {
      const res = await db.query('SELECT phone FROM workers WHERE id = $1', [workerId]);
      expect(res.rows[0].phone).toBe('+5491199999999');
    });

    it('deve ter salvo dados criptografados (first_name_encrypted não nulo)', async () => {
      const res = await db.query(
        'SELECT first_name_encrypted, last_name_encrypted FROM workers WHERE id = $1',
        [workerId],
      );
      expect(res.rows[0].first_name_encrypted).not.toBeNull();
      expect(res.rows[0].last_name_encrypted).not.toBeNull();
    });

    it('deve retornar 401 sem authUid', async () => {
      await expect(
        api.put('/api/workers/me/general-info', payload),
      ).rejects.toMatchObject({ response: { status: 401 } });
    });

    it('deve retornar 404 se authUid não corresponde a nenhum worker', async () => {
      const ghostTokenRes = await api.post('/api/test/auth/token', {
        uid: 'nonexistent-auth-uid',
        email: 'ghost@e2e.local',
        role: 'worker',
      });
      const ghostToken = ghostTokenRes.data.data.token;

      await expect(
        api.put(
          '/api/workers/me/general-info',
          payload,
          { headers: { Authorization: `Bearer ${ghostToken}` } },
        ),
      ).rejects.toMatchObject({ response: { status: 404 } });
    });

    it('deve permitir salvar múltiplas vezes (idempotente)', async () => {
      const res = await api.put(
        '/api/workers/me/general-info',
        { ...payload, titleCertificate: 'Updated Cert' },
        authHeaders(),
      );
      expect(res.status).toBe(200);
    });

    it('deve retornar os dados atualizados via GET /api/workers/me', async () => {
      const res = await api.get('/api/workers/me', authHeaders());
      expect(res.data.data.phone).toBe('+5491199999999');
      expect(res.data.data.profession).toBe('CARER');
    });
  });

  // ──────────────────────────────────────────────
  // PUT /api/workers/me/service-area
  // ──────────────────────────────────────────────
  describe('PUT /api/workers/me/service-area', () => {
    const payload = {
      address: 'Av. Corrientes 1234, Buenos Aires',
      addressComplement: 'Piso 3',
      serviceRadiusKm: 10,
      lat: -34.603722,
      lng: -58.381592,
    };

    it('deve retornar 200 e success: true', async () => {
      const res = await api.put('/api/workers/me/service-area', payload, authHeaders());

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.message).toBe('Service area saved');
    });

    it('deve ter criado exatamente 1 registro em worker_service_areas', async () => {
      const res = await db.query(
        'SELECT * FROM worker_service_areas WHERE worker_id = $1',
        [workerId],
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].address_line).toContain('Corrientes');
      expect(res.rows[0].radius_km).toBe(10);
    });

    it('deve fazer upsert: salvar 2x mantém apenas 1 registro', async () => {
      await api.put(
        '/api/workers/me/service-area',
        { ...payload, serviceRadiusKm: 20 },
        authHeaders(),
      );

      const res = await db.query(
        'SELECT * FROM worker_service_areas WHERE worker_id = $1',
        [workerId],
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].radius_km).toBe(20);
    });

    it('deve retornar 401 sem authUid', async () => {
      await expect(
        api.put('/api/workers/me/service-area', payload),
      ).rejects.toMatchObject({ response: { status: 401 } });
    });
  });

});
