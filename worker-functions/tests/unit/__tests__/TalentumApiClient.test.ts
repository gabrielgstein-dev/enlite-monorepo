/**
 * TalentumApiClient — Unit Tests
 *
 * Coverage: constructor, factories (fromEnv, fromSecretManager, create),
 * login (RSA-OAEP + cookie extraction), ensureAuth (auto-refresh),
 * CRUD methods (createPrescreening, getPrescreening, deletePrescreening, listPrescreenings),
 * and error propagation.
 *
 * All HTTP calls are mocked via global.fetch.
 */

import crypto from 'crypto';

// ── Mocks ────────────────────────────────────────────────────────────

const mockAccessSecretVersion = jest.fn();
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: mockAccessSecretVersion,
  })),
}), { virtual: true });

// Preserve original fetch for restoration
const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
  mockAccessSecretVersion.mockReset();
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeCookieHeaders(tlAuth = 'mock-tl-auth', tlRefresh = 'mock-tl-refresh') {
  return [
    `tl_auth=${tlAuth}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=10800`,
    `tl_refresh=${tlRefresh}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800`,
    `tl_prefs=lang%3Des; Path=/; Secure; SameSite=None; Max-Age=31536000`,
  ];
}

function mockLoginResponse(cookies?: string[]) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
    headers: {
      getSetCookie: () => cookies ?? makeCookieHeaders(),
    },
  };
}

function mockApiResponse<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data,
    headers: {
      getSetCookie: () => [],
    },
  };
}

function mockErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: {
      getSetCookie: () => [],
    },
  };
}

// Import AFTER mocks are set up
import { TalentumApiClient } from '../../../src/modules/integration/infrastructure/TalentumApiClient';

// ── Tests ────────────────────────────────────────────────────────────

describe('TalentumApiClient', () => {
  // ── Constructor ──────────────────────────────────────────────────
  describe('constructor', () => {
    it('stores email and password', () => {
      const client = new TalentumApiClient('test@example.com', 'secret');
      // Client should exist — internal state is private, verified via login
      expect(client).toBeDefined();
    });
  });

  // ── Static factories ─────────────────────────────────────────────
  describe('fromEnv()', () => {
    const origEmail = process.env.TALENTUM_API_EMAIL;
    const origPassword = process.env.TALENTUM_API_PASSWORD;

    afterEach(() => {
      if (origEmail !== undefined) process.env.TALENTUM_API_EMAIL = origEmail;
      else delete process.env.TALENTUM_API_EMAIL;
      if (origPassword !== undefined) process.env.TALENTUM_API_PASSWORD = origPassword;
      else delete process.env.TALENTUM_API_PASSWORD;
    });

    it('creates client from env vars', () => {
      process.env.TALENTUM_API_EMAIL = 'env@test.com';
      process.env.TALENTUM_API_PASSWORD = 'env-pass';

      const client = TalentumApiClient.fromEnv();
      expect(client).toBeInstanceOf(TalentumApiClient);
    });

    it('throws when TALENTUM_API_EMAIL is missing', () => {
      delete process.env.TALENTUM_API_EMAIL;
      process.env.TALENTUM_API_PASSWORD = 'pass';

      expect(() => TalentumApiClient.fromEnv()).toThrow(
        'TALENTUM_API_EMAIL and TALENTUM_API_PASSWORD must be set'
      );
    });

    it('throws when TALENTUM_API_PASSWORD is missing', () => {
      process.env.TALENTUM_API_EMAIL = 'email@test.com';
      delete process.env.TALENTUM_API_PASSWORD;

      expect(() => TalentumApiClient.fromEnv()).toThrow(
        'TALENTUM_API_EMAIL and TALENTUM_API_PASSWORD must be set'
      );
    });

    it('throws when both vars are missing', () => {
      delete process.env.TALENTUM_API_EMAIL;
      delete process.env.TALENTUM_API_PASSWORD;

      expect(() => TalentumApiClient.fromEnv()).toThrow(
        'TALENTUM_API_EMAIL and TALENTUM_API_PASSWORD must be set'
      );
    });
  });

  describe('fromSecretManager()', () => {
    it('creates client from GCP Secret Manager', async () => {
      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'sm@test.com' } } }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'sm-pass' } } }]);

      const client = await TalentumApiClient.fromSecretManager();
      expect(client).toBeInstanceOf(TalentumApiClient);
      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(2);
    });

    it('uses GCP_PROJECT_ID env var when set', async () => {
      const origProjectId = process.env.GCP_PROJECT_ID;
      process.env.GCP_PROJECT_ID = 'my-custom-project';

      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'email' } } }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'pass' } } }]);

      await TalentumApiClient.fromSecretManager();

      expect(mockAccessSecretVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('my-custom-project'),
        })
      );

      if (origProjectId !== undefined) process.env.GCP_PROJECT_ID = origProjectId;
      else delete process.env.GCP_PROJECT_ID;
    });

    it('throws when Secret Manager returns empty email', async () => {
      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: { data: { toString: () => '' } } }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'pass' } } }]);

      await expect(TalentumApiClient.fromSecretManager()).rejects.toThrow(
        'secrets returned empty values'
      );
    });

    it('throws when Secret Manager returns empty password', async () => {
      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'email' } } }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => '' } } }]);

      await expect(TalentumApiClient.fromSecretManager()).rejects.toThrow(
        'secrets returned empty values'
      );
    });

    it('throws when Secret Manager returns undefined payload', async () => {
      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: undefined }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'pass' } } }]);

      await expect(TalentumApiClient.fromSecretManager()).rejects.toThrow(
        'secrets returned empty values'
      );
    });
  });

  describe('create()', () => {
    const origEmail = process.env.TALENTUM_API_EMAIL;
    const origPassword = process.env.TALENTUM_API_PASSWORD;

    afterEach(() => {
      if (origEmail !== undefined) process.env.TALENTUM_API_EMAIL = origEmail;
      else delete process.env.TALENTUM_API_EMAIL;
      if (origPassword !== undefined) process.env.TALENTUM_API_PASSWORD = origPassword;
      else delete process.env.TALENTUM_API_PASSWORD;
    });

    it('uses fromEnv when env vars are present', async () => {
      process.env.TALENTUM_API_EMAIL = 'env@test.com';
      process.env.TALENTUM_API_PASSWORD = 'env-pass';

      const client = await TalentumApiClient.create();
      expect(client).toBeInstanceOf(TalentumApiClient);
      // Should NOT have called Secret Manager
      expect(mockAccessSecretVersion).not.toHaveBeenCalled();
    });

    it('falls back to fromSecretManager when env vars absent', async () => {
      delete process.env.TALENTUM_API_EMAIL;
      delete process.env.TALENTUM_API_PASSWORD;

      mockAccessSecretVersion
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'sm@test.com' } } }])
        .mockResolvedValueOnce([{ payload: { data: { toString: () => 'sm-pass' } } }]);

      const client = await TalentumApiClient.create();
      expect(client).toBeInstanceOf(TalentumApiClient);
      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(2);
    });
  });

  // ── Login / Auth ─────────────────────────────────────────────────
  describe('login + ensureAuth', () => {
    it('sends RSA-OAEP encrypted password on login', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'my-password');
      await client.listPrescreenings();

      // Verify login was called
      const loginCall = mockFetch.mock.calls[0];
      expect(loginCall[0]).toBe('https://api.production.talentum.chat/auth/login');
      const loginBody = JSON.parse(loginCall[1].body);
      expect(loginBody.email).toBe('test@test.com');
      // Password should be base64 encoded (RSA encrypted)
      expect(loginBody.password).not.toBe('my-password');
      expect(Buffer.from(loginBody.password, 'base64').length).toBeGreaterThan(0);
    });

    it('sends correct headers on login', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();

      const loginHeaders = mockFetch.mock.calls[0][1].headers;
      expect(loginHeaders['Content-Type']).toBe('application/json');
      expect(loginHeaders.Origin).toBe('https://www.talentum.chat');
    });

    it('extracts tl_auth and tl_refresh from Set-Cookie', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse(makeCookieHeaders('my-auth', 'my-refresh')))
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();

      // The API call should include the cookies
      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[1].headers.Cookie).toBe('tl_auth=my-auth; tl_refresh=my-refresh');
    });

    it('throws when login returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(401, '{"message":"Invalid credentials"}'));

      const client = new TalentumApiClient('bad@test.com', 'bad-pass');
      await expect(client.listPrescreenings()).rejects.toThrow(
        'login failed — HTTP 401'
      );
    });

    it('throws when Set-Cookie headers are missing tl_auth', async () => {
      mockFetch.mockResolvedValueOnce(mockLoginResponse([
        'tl_refresh=token; Path=/; HttpOnly',
        'tl_prefs=lang%3Des; Path=/',
      ]));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.listPrescreenings()).rejects.toThrow(
        'tl_auth/tl_refresh cookies were not found'
      );
    });

    it('throws when Set-Cookie headers are missing tl_refresh', async () => {
      mockFetch.mockResolvedValueOnce(mockLoginResponse([
        'tl_auth=token; Path=/; HttpOnly',
        'tl_prefs=lang%3Des; Path=/',
      ]));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.listPrescreenings()).rejects.toThrow(
        'tl_auth/tl_refresh cookies were not found'
      );
    });

    it('handles missing getSetCookie method (empty cookies)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({}),
        headers: {
          // No getSetCookie method — simulates older Node
        },
      });

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.listPrescreenings()).rejects.toThrow(
        'tl_auth/tl_refresh cookies were not found'
      );
    });

    it('does NOT re-login when token is still valid', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }))
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();
      await client.listPrescreenings();

      // Login called only once, two API calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toContain('/auth/login');
      expect(mockFetch.mock.calls[1][0]).toContain('/pre-screening/projects');
      expect(mockFetch.mock.calls[2][0]).toContain('/pre-screening/projects');
    });

    it('re-logins when token is expired', async () => {
      // First login + call
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();

      // Force token expiration by manipulating internal state
      (client as any).auth.expiresAt = Date.now() - 1000;

      // Second login + call
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse(makeCookieHeaders('new-auth', 'new-refresh')))
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      await client.listPrescreenings();

      // Total: 2 logins + 2 API calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[2][0]).toContain('/auth/login');
    });
  });

  // ── CRUD methods ──────────────────────────────────────────────────
  describe('createPrescreening()', () => {
    it('sends correct payload and returns projectId + publicId', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(
          mockApiResponse({ projectId: 'proj-123', publicId: 'pub-456' })
        );

      const client = new TalentumApiClient('test@test.com', 'pass');
      const result = await client.createPrescreening({
        title: 'Test Vacancy',
        description: 'Test description',
        questions: [
          {
            question: 'What experience?',
            type: 'text',
            responseType: ['text', 'audio'],
            desiredResponse: '6 months',
            weight: 8,
            required: true,
            analyzed: true,
            earlyStoppage: false,
          },
        ],
        faq: [{ question: 'Salary?', answer: 'TBD' }],
      });

      expect(result).toEqual({ projectId: 'proj-123', publicId: 'pub-456' });

      // Verify POST payload
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.type).toBe('WHATSAPP');
      expect(body.title).toBe('Test Vacancy');
      expect(body.questions).toHaveLength(1);
      expect(body.faq).toHaveLength(1);
    });

    it('applies default values for askForCv, cvRequired, linkedinRequired', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projectId: 'p1', publicId: 'u1' }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.createPrescreening({
        title: 'T',
        description: 'D',
        questions: [],
      });

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.askForCv).toBe(false);
      expect(body.cvRequired).toBe(false);
      expect(body.linkedinRequired).toBe(false);
    });

    it('respects explicit askForCv/cvRequired/linkedinRequired values', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projectId: 'p1', publicId: 'u1' }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.createPrescreening({
        title: 'T',
        description: 'D',
        questions: [],
        askForCv: true,
        cvRequired: true,
        linkedinRequired: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.askForCv).toBe(true);
      expect(body.cvRequired).toBe(true);
      expect(body.linkedinRequired).toBe(true);
    });

    it('uses POST method and correct path', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projectId: 'p1', publicId: 'u1' }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.createPrescreening({ title: 'T', description: 'D', questions: [] });

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.production.talentum.chat/pre-screening/projects');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('getPrescreening()', () => {
    it('returns full project data including whatsappUrl', async () => {
      const project = {
        projectId: 'proj-123',
        publicId: 'pub-456',
        title: 'Test',
        description: 'Desc',
        whatsappUrl: 'https://wa.me/123?text=abc',
        slug: '#u8m1outj',
        active: true,
        timestamp: '2026-04-01T12:00:00Z',
        questions: [],
        faq: [],
      };

      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse(project));

      const client = new TalentumApiClient('test@test.com', 'pass');
      const result = await client.getPrescreening('proj-123');

      expect(result).toEqual(project);
      expect(result.whatsappUrl).toBe('https://wa.me/123?text=abc');
    });

    it('uses GET method and correct path', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({}));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.getPrescreening('proj-abc');

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.production.talentum.chat/pre-screening/projects/proj-abc');
      expect(opts.method).toBe('GET');
      expect(opts.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('deletePrescreening()', () => {
    it('resolves without error on success', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => '',
          json: async () => ({}),
          headers: { getSetCookie: () => [] },
        });

      const client = new TalentumApiClient('test@test.com', 'pass');
      const result = await client.deletePrescreening('proj-to-delete');

      expect(result).toBeUndefined();
    });

    it('uses DELETE method and correct path', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '', headers: { getSetCookie: () => [] } });

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.deletePrescreening('proj-del');

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.production.talentum.chat/pre-screening/projects/proj-del');
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('listPrescreenings()', () => {
    it('returns projects array and count', async () => {
      const data = {
        projects: [{ projectId: 'p1', title: 'V1' }],
        count: 1,
      };

      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse(data));

      const client = new TalentumApiClient('test@test.com', 'pass');
      const result = await client.listPrescreenings();

      expect(result.projects).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('uses GET method and correct path', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.production.talentum.chat/pre-screening/projects');
      expect(opts.method).toBe('GET');
    });
  });

  // ── Error propagation ─────────────────────────────────────────────
  describe('error propagation (CA-1.7)', () => {
    it('includes HTTP status in error message for API errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockErrorResponse(422, '{"error":"Invalid payload"}'));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.createPrescreening({ title: '', description: '', questions: [] }))
        .rejects.toThrow('HTTP 422');
    });

    it('includes response body in error message', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.getPrescreening('bad-id'))
        .rejects.toThrow('Internal Server Error');
    });

    it('includes method and path in error message', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockErrorResponse(404, 'Not found'));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await expect(client.deletePrescreening('missing'))
        .rejects.toThrow('DELETE /pre-screening/projects/missing');
    });
  });

  // ── Auth header on all requests ────────────────────────────────────
  describe('auth cookies sent on all requests', () => {
    it('sends Cookie header with tl_auth + tl_refresh on every API call', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse(makeCookieHeaders('a-token', 'r-token')))
        .mockResolvedValueOnce(mockApiResponse({}))
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }))
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '', headers: { getSetCookie: () => [] } });

      const client = new TalentumApiClient('test@test.com', 'pass');

      await client.getPrescreening('p1');
      await client.listPrescreenings();
      await client.deletePrescreening('p2');

      for (let i = 1; i <= 3; i++) {
        expect(mockFetch.mock.calls[i][1].headers.Cookie).toBe(
          'tl_auth=a-token; tl_refresh=r-token'
        );
      }
    });

    it('sends Origin header on all requests', async () => {
      mockFetch
        .mockResolvedValueOnce(mockLoginResponse())
        .mockResolvedValueOnce(mockApiResponse({ projects: [], count: 0 }));

      const client = new TalentumApiClient('test@test.com', 'pass');
      await client.listPrescreenings();

      const apiHeaders = mockFetch.mock.calls[1][1].headers;
      expect(apiHeaders.Origin).toBe('https://www.talentum.chat');
    });
  });
});
