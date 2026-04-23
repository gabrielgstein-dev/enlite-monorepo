import { MultiAuthService } from '../MultiAuthService';
import { CredentialType, PrincipalType } from '../../domain/Auth';
import * as admin from 'firebase-admin';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => {
  const mockAuth = {
    verifyIdToken: jest.fn(),
  };
  
  return {
    apps: [],
    initializeApp: jest.fn(),
    auth: jest.fn(() => mockAuth),
  };
});

describe('MultiAuthService', () => {
  let authService: MultiAuthService;
  let mockVerifyIdToken: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    authService = new MultiAuthService({
      enableApiKeys: true,
      enableJwt: false,
      enableGoogleIdToken: true,
      googleClientId: 'test-client-id',
    });

    mockVerifyIdToken = (admin.auth() as any).verifyIdToken;
  });

  describe('parseCredentials', () => {
    it('should parse Bearer token as GOOGLE_ID_TOKEN (critical for Firebase auth)', () => {
      const headers = {
        'authorization': 'Bearer firebase-id-token-12345',
      };

      const credentials = authService.parseCredentials(headers);

      expect(credentials).not.toBeNull();
      expect(credentials?.type).toBe(CredentialType.GOOGLE_ID_TOKEN);
      expect(credentials?.token).toBe('firebase-id-token-12345');
    });

    it('should parse X-Google-Id-Token header as GOOGLE_ID_TOKEN', () => {
      const headers = {
        'x-google-id-token': 'google-token-12345',
      };

      const credentials = authService.parseCredentials(headers);

      expect(credentials).not.toBeNull();
      expect(credentials?.type).toBe(CredentialType.GOOGLE_ID_TOKEN);
      expect(credentials?.token).toBe('google-token-12345');
    });

    it('should parse X-Api-Key header as API_KEY', () => {
      const headers = {
        'x-api-key': 'api-key-12345',
      };

      const credentials = authService.parseCredentials(headers);

      expect(credentials).not.toBeNull();
      expect(credentials?.type).toBe(CredentialType.API_KEY);
      expect(credentials?.token).toBe('api-key-12345');
    });

    it('should return null for missing credentials', () => {
      const headers = {};

      const credentials = authService.parseCredentials(headers);

      expect(credentials).toBeNull();
    });

    it('should prioritize API key over Bearer token', () => {
      const headers = {
        'x-api-key': 'api-key-12345',
        'authorization': 'Bearer token-12345',
      };

      const credentials = authService.parseCredentials(headers);

      expect(credentials?.type).toBe(CredentialType.API_KEY);
    });

    it('should extract token correctly from Bearer header', () => {
      const headers = {
        'authorization': 'Bearer my-firebase-token-abc123',
      };

      const credentials = authService.parseCredentials(headers);

      expect(credentials).not.toBeNull();
      expect(credentials?.type).toBe(CredentialType.GOOGLE_ID_TOKEN);
      expect(credentials?.token).toBe('my-firebase-token-abc123');
    });
  });

  describe('authenticateGoogleIdToken', () => {
    it('should successfully authenticate valid Firebase ID token', async () => {
      const mockDecodedToken = {
        uid: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockVerifyIdToken.mockResolvedValue(mockDecodedToken);

      const credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-firebase-token',
        scopes: [],
      };

      const metadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req-123',
        timestamp: new Date(),
        path: '/api/workers/me',
        method: 'GET',
      };

      const authContext = await authService.authenticate(credentials, metadata);

      expect(authContext).not.toBeNull();
      expect(authContext?.principal.id).toBe('user-123');
      expect(authContext?.principal.type).toBe(PrincipalType.USER);
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-firebase-token');
    });

    it('should return null for invalid Firebase ID token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'invalid-token',
        scopes: [],
      };

      const metadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req-123',
        timestamp: new Date(),
        path: '/api/workers/me',
        method: 'GET',
      };

      const authContext = await authService.authenticate(credentials, metadata);

      expect(authContext).toBeNull();
      expect(mockVerifyIdToken).toHaveBeenCalledWith('invalid-token');
    });

    it('should return null when Google ID Token is disabled', async () => {
      const disabledAuthService = new MultiAuthService({
        enableApiKeys: true,
        enableJwt: false,
        enableGoogleIdToken: false,
      });

      const credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-token',
        scopes: [],
      };

      const metadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req-123',
        timestamp: new Date(),
        path: '/api/workers/me',
        method: 'GET',
      };

      const authContext = await disabledAuthService.authenticate(credentials, metadata);

      expect(authContext).toBeNull();
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('should handle expired Firebase tokens', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

      const credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'expired-token',
        scopes: [],
      };

      const metadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req-123',
        timestamp: new Date(),
        path: '/api/workers/me',
        method: 'GET',
      };

      const authContext = await authService.authenticate(credentials, metadata);

      expect(authContext).toBeNull();
    });
  });

  describe('Full authentication flow (parseCredentials + authenticate)', () => {
    it('should complete full flow: Bearer token -> GOOGLE_ID_TOKEN -> Firebase verification', async () => {
      const mockDecodedToken = {
        uid: 'user-456',
        email: 'worker@example.com',
        name: 'Worker User',
      };

      mockVerifyIdToken.mockResolvedValue(mockDecodedToken);

      // Step 1: Parse credentials from headers
      const headers = {
        'authorization': 'Bearer firebase-token-from-frontend',
      };

      const credentials = authService.parseCredentials(headers);

      // Step 2: Authenticate
      const metadata = {
        ipAddress: '192.168.1.1',
        requestId: 'req-789',
        timestamp: new Date(),
        path: '/api/workers/init',
        method: 'POST',
      };

      const authContext = await authService.authenticate(credentials!, metadata);

      // Assertions
      expect(credentials?.type).toBe(CredentialType.GOOGLE_ID_TOKEN);
      expect(authContext).not.toBeNull();
      expect(authContext?.principal.id).toBe('user-456');
      expect(authContext?.principal.type).toBe(PrincipalType.USER);
      expect(authContext?.credentials.scopes).toContain('workers:read');
      expect(authContext?.credentials.scopes).toContain('workers:write');
      expect(mockVerifyIdToken).toHaveBeenCalledWith('firebase-token-from-frontend');
    });
  });
});
