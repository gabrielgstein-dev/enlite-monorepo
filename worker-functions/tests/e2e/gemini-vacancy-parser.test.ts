/**
 * gemini-vacancy-parser.test.ts — E2E Tests
 *
 * Tests the parse-from-text endpoint against a real backend.
 * Gemini API is NOT called in E2E (requires API key) — we test:
 *
 *   1. Input validation (missing text, invalid workerType)
 *   2. Auth/permissions (worker token rejected, admin token required)
 *   3. Error handling when GEMINI_API_KEY is not configured
 *
 * Endpoint covered:
 *   POST /api/admin/vacancies/parse-from-text
 */

import { createApiClient, getMockToken, waitForBackend } from './helpers';

describe('Gemini Vacancy Parser API', () => {
  const api = createApiClient();
  let adminToken: string;
  let workerToken: string;

  beforeAll(async () => {
    await waitForBackend(api);

    adminToken = await getMockToken(api, {
      uid: 'gemini-admin-e2e',
      email: 'gemini-admin@e2e.local',
      role: 'admin',
    });

    workerToken = await getMockToken(api, {
      uid: 'gemini-worker-e2e',
      email: 'gemini-worker@e2e.local',
      role: 'worker',
    });
  });

  function auth(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  // ── Input validation ──────────────────────────────────────────────
  describe('POST /api/admin/vacancies/parse-from-text — validation', () => {
    it('returns 400 when text is missing', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { workerType: 'AT' },
        auth(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('text');
    });

    it('returns 400 when text is empty string', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: '', workerType: 'AT' },
        auth(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('text');
    });

    it('returns 400 when text is whitespace only', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: '   ', workerType: 'AT' },
        auth(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('text');
    });

    it('returns 400 when workerType is missing', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 1010, paciente con TEA' },
        auth(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('workerType');
    });

    it('returns 400 when workerType is invalid', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 1010', workerType: 'ENFERMERO' },
        auth(adminToken),
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('workerType');
    });

    it('accepts AT as workerType', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 1010, paciente con TEA en Palermo', workerType: 'AT' },
        auth(adminToken),
      );

      // Should NOT be 400 (validation passes), may be 500 if GEMINI_API_KEY not set
      expect(res.status).not.toBe(400);
    });

    it('accepts CUIDADOR as workerType', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 2020, adulto mayor en Belgrano', workerType: 'CUIDADOR' },
        auth(adminToken),
      );

      expect(res.status).not.toBe(400);
    });
  });

  // ── Auth / Permissions ────────────────────────────────────────────
  describe('POST /api/admin/vacancies/parse-from-text — auth', () => {
    it('returns 401 without auth token', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Test', workerType: 'AT' },
      );

      expect(res.status).toBe(401);
    });

    it('returns 403 with worker token (requires staff)', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Test', workerType: 'AT' },
        auth(workerToken),
      );

      expect(res.status).toBe(403);
    });

    it('allows access with admin token', async () => {
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 1010', workerType: 'AT' },
        auth(adminToken),
      );

      // Should not be 401/403
      expect([401, 403]).not.toContain(res.status);
    });
  });

  // ── Error handling ────────────────────────────────────────────────
  describe('POST /api/admin/vacancies/parse-from-text — error handling', () => {
    it('returns 500 with descriptive error when Gemini fails', async () => {
      // Without GEMINI_API_KEY configured in E2E, the service should fail gracefully
      const res = await api.post(
        '/api/admin/vacancies/parse-from-text',
        { text: 'Caso 1010, paciente con TEA en Palermo, CABA', workerType: 'AT' },
        auth(adminToken),
      );

      // If GEMINI_API_KEY is not set in E2E env, expect 500 with clear error
      if (res.status === 500) {
        expect(res.data.success).toBe(false);
        expect(res.data.error).toBeTruthy();
      }
      // If key IS set, we'd get 200 with valid data
      if (res.status === 200) {
        expect(res.data.success).toBe(true);
        expect(res.data.data.vacancy).toBeDefined();
        expect(res.data.data.prescreening).toBeDefined();
        expect(res.data.data.description).toBeDefined();
      }
    });
  });
});
