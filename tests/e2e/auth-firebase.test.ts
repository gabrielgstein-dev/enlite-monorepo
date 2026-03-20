import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8081';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://enlite_test:test_password@localhost:5433/enlite_test';

/**
 * E2E Test: Firebase Authentication Flow
 * 
 * CRITICAL: This test ensures that Bearer tokens from Firebase are correctly
 * authenticated. This prevents regression of the bug where Bearer tokens were
 * incorrectly classified as JWT instead of GOOGLE_ID_TOKEN.
 */
describe('Firebase Authentication E2E', () => {
  let api: AxiosInstance;
  let db: Pool;
  let mockAuthToken: string;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    db = new Pool({
      connectionString: DATABASE_URL,
    });

    // Wait for backend to be ready
    await waitForBackend();

    // Generate mock auth token for testing
    mockAuthToken = await generateMockAuthToken();
  });

  afterAll(async () => {
    await db.end();
  });

  async function waitForBackend(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await api.get('/health');
        console.log('✅ Backend ready');
        return;
      } catch (error) {
        console.log(`⏳ Waiting for backend... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Backend not ready after 30 seconds');
  }

  async function generateMockAuthToken(): Promise<string> {
    // When USE_MOCK_AUTH=true, the backend provides a mock token endpoint
    try {
      const response = await api.post('/test/mock-auth/token', {
        uid: 'test-user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
      return response.data.token;
    } catch (error) {
      console.warn('Mock auth not available, using placeholder token');
      return 'mock-firebase-token-for-testing';
    }
  }

  describe('Bearer Token Authentication', () => {
    it('should authenticate with Bearer token in Authorization header', async () => {
      const response = await api.get('/api/workers/me', {
        headers: {
          'Authorization': `Bearer ${mockAuthToken}`,
        },
        validateStatus: () => true, // Don't throw on 404
      });

      // Should not return 401 Unauthorized
      expect(response.status).not.toBe(401);
      
      // Either 200 (worker exists) or 404 (worker not found) is acceptable
      // Both indicate successful authentication
      expect([200, 404]).toContain(response.status);
    });

    it('should reject request without Bearer token', async () => {
      const response = await api.get('/api/workers/me', {
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
      expect(response.data.error).toMatch(/authentication required/i);
    });

    it('should reject request with invalid Bearer token', async () => {
      const response = await api.get('/api/workers/me', {
        headers: {
          'Authorization': 'Bearer invalid-token-12345',
        },
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
    });

    it('should authenticate POST /api/workers/init with Bearer token', async () => {
      const testEmail = `test-${Date.now()}@example.com`;
      
      const response = await api.post(
        '/api/workers/init',
        {
          authUid: 'test-user-123',
          email: testEmail,
        },
        {
          headers: {
            'Authorization': `Bearer ${mockAuthToken}`,
          },
          validateStatus: () => true,
        }
      );

      // Should not return 401 Unauthorized
      expect(response.status).not.toBe(401);
      
      // Should return 200 or 201 for successful init
      expect([200, 201]).toContain(response.status);
      
      if (response.status === 200 || response.status === 201) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('id');
        expect(response.data.data).toHaveProperty('authUid');
        expect(response.data.data.email).toBe(testEmail);
      }
    });

    it('should authenticate PUT /api/workers/step with Bearer token', async () => {
      // First init a worker
      const testEmail = `test-step-${Date.now()}@example.com`;
      const initResponse = await api.post(
        '/api/workers/init',
        {
          authUid: 'test-user-step',
          email: testEmail,
        },
        {
          headers: {
            'Authorization': `Bearer ${mockAuthToken}`,
          },
        }
      );

      const workerId = initResponse.data.data.id;

      // Then save a step
      const stepResponse = await api.put(
        '/api/workers/step',
        {
          workerId,
          step: 2,
          data: {
            fullName: 'Test Worker',
            phone: '+5511999999999',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${mockAuthToken}`,
          },
          validateStatus: () => true,
        }
      );

      // Should not return 401 Unauthorized
      expect(stepResponse.status).not.toBe(401);
      
      // Should return 200 for successful step save
      expect(stepResponse.status).toBe(200);
    });
  });

  describe('Alternative Authentication Headers', () => {
    it('should authenticate with X-Google-Id-Token header', async () => {
      const response = await api.get('/api/workers/me', {
        headers: {
          'X-Google-Id-Token': mockAuthToken,
        },
        validateStatus: () => true,
      });

      // Should not return 401 Unauthorized
      expect(response.status).not.toBe(401);
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('CORS Preflight', () => {
    it('should handle OPTIONS request for CORS preflight', async () => {
      const response = await api.options('/api/workers/me', {
        headers: {
          'Origin': 'https://enlite-frontend-121472682203.us-central1.run.app',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization',
        },
        validateStatus: () => true,
      });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Regression Prevention', () => {
    it('CRITICAL: Bearer token must be classified as GOOGLE_ID_TOKEN, not JWT', async () => {
      // This test prevents the bug where Bearer tokens were incorrectly
      // routed to authenticateJwt() instead of authenticateGoogleIdToken()
      
      const response = await api.get('/api/workers/me', {
        headers: {
          'Authorization': `Bearer ${mockAuthToken}`,
        },
        validateStatus: () => true,
      });

      // If this returns 401, it means Bearer tokens are being misclassified
      // and routed to the wrong authentication method
      expect(response.status).not.toBe(401);
      
      if (response.status === 401) {
        throw new Error(
          'REGRESSION DETECTED: Bearer token returned 401. ' +
          'This likely means Bearer tokens are being classified as JWT ' +
          'instead of GOOGLE_ID_TOKEN in parseCredentials()'
        );
      }
    });
  });
});
