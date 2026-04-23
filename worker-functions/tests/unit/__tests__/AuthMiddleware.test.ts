import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from '../../../src/modules/identity/interfaces/middleware/AuthMiddleware';
import { IAuthenticationService } from '../../../src/modules/identity/ports/IAuthenticationService';
import { IAuthorizationEngine } from '../../../src/modules/identity/ports/IAuthorizationEngine';
import { AuthContext, Principal, PrincipalType, Credentials, CredentialType, RequestMetadata } from '../../../src/modules/identity/domain/Auth';

/**
 * Testes unitários para AuthMiddleware.requireAdmin()
 * 
 * Garante que:
 * 1. Usuários sem autenticação são bloqueados (401)
 * 2. Usuários autenticados sem role 'admin' são bloqueados (403)
 * 3. Usuários com role 'worker' são bloqueados (403)
 * 4. Apenas usuários com role 'admin' têm acesso
 */
describe('AuthMiddleware.requireAdmin()', () => {
  let authMiddleware: AuthMiddleware;
  let mockAuthService: jest.Mocked<IAuthenticationService>;
  let mockAuthzEngine: jest.Mocked<IAuthorizationEngine>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    // Mock do serviço de autenticação
    mockAuthService = {
      parseCredentials: jest.fn(),
      authenticate: jest.fn(),
    } as unknown as jest.Mocked<IAuthenticationService>;

    // Mock do engine de autorização
    mockAuthzEngine = {} as jest.Mocked<IAuthorizationEngine>;

    authMiddleware = new AuthMiddleware(mockAuthService, mockAuthzEngine);

    // Mock da request
    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      path: '/api/admin/users',
      method: 'GET',
    };

    // Mock da response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock do next
    mockNext = jest.fn();
  });

  describe('Bloqueio de acesso não autenticado', () => {
    it('deve retornar 401 quando não há credenciais', async () => {
      mockAuthService.parseCredentials.mockReturnValue(null);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando credenciais são inválidas', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.JWT,
        token: 'invalid-token',
        scopes: [],
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(null);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid credentials',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Bloqueio de usuários não-admin', () => {
    it('deve retornar 403 quando usuário não tem role admin (worker)', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-worker-token',
        scopes: ['workers:read'],
      };

      const mockMetadata: RequestMetadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req_123',
        timestamp: new Date(),
        path: '/api/admin/users',
        method: 'GET',
      };

      const workerAuthContext: AuthContext = {
        principal: {
          id: 'worker-uid-123',
          type: PrincipalType.WORKER,
          roles: ['worker'], // Usuário é worker, não admin
        },
        credentials: mockCredentials,
        metadata: mockMetadata,
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(workerAuthContext);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Admin access required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 403 quando usuário não tem roles definidas', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-token-no-roles',
        scopes: [],
      };

      const mockMetadata: RequestMetadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req_456',
        timestamp: new Date(),
        path: '/api/admin/users',
        method: 'GET',
      };

      const authContextNoRoles: AuthContext = {
        principal: {
          id: 'user-uid-456',
          type: PrincipalType.USER,
          roles: [], // Sem roles
        },
        credentials: mockCredentials,
        metadata: mockMetadata,
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(authContextNoRoles);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Admin access required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('deve retornar 403 quando usuário tem outras roles mas não admin', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-manager-token',
        scopes: ['users:read'],
      };

      const mockMetadata: RequestMetadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req_789',
        timestamp: new Date(),
        path: '/api/admin/users',
        method: 'GET',
      };

      const managerAuthContext: AuthContext = {
        principal: {
          id: 'manager-uid-789',
          type: PrincipalType.USER,
          roles: ['manager', 'support'], // Tem roles, mas não 'admin'
        },
        credentials: mockCredentials,
        metadata: mockMetadata,
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(managerAuthContext);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Admin access required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Acesso permitido para admins', () => {
    it('deve permitir acesso quando usuário tem role admin', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-admin-token',
        scopes: ['admin:all'],
      };

      const mockMetadata: RequestMetadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req_admin_001',
        timestamp: new Date(),
        path: '/api/admin/users',
        method: 'GET',
      };

      const adminAuthContext: AuthContext = {
        principal: {
          id: 'admin-uid-001',
          type: PrincipalType.ADMIN,
          roles: ['admin'], // Usuário é admin
        },
        credentials: mockCredentials,
        metadata: mockMetadata,
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(adminAuthContext);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).authContext).toEqual(adminAuthContext);
      expect((mockReq as any).user).toEqual({
        uid: 'admin-uid-001',
        type: PrincipalType.ADMIN,
        roles: ['admin'],
      });
    });

    it('deve permitir acesso quando usuário tem role admin entre outras roles', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'valid-super-admin-token',
        scopes: ['admin:all', 'super:all'],
      };

      const mockMetadata: RequestMetadata = {
        ipAddress: '127.0.0.1',
        requestId: 'req_admin_002',
        timestamp: new Date(),
        path: '/api/admin/users',
        method: 'POST',
      };

      const superAdminAuthContext: AuthContext = {
        principal: {
          id: 'super-admin-uid-002',
          type: PrincipalType.ADMIN,
          roles: ['admin', 'super', 'manager'], // Múltiplas roles incluindo admin
        },
        credentials: mockCredentials,
        metadata: mockMetadata,
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockResolvedValue(superAdminAuthContext);

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando ocorre erro na autenticação', async () => {
      const mockCredentials: Credentials = {
        type: CredentialType.GOOGLE_ID_TOKEN,
        token: 'token-that-causes-error',
        scopes: [],
      };

      mockAuthService.parseCredentials.mockReturnValue(mockCredentials);
      mockAuthService.authenticate.mockRejectedValue(new Error('Database connection failed'));

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication error',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
