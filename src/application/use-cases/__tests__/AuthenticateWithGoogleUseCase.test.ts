import { describe, it, expect, vi } from 'vitest';
import { AuthenticateWithGoogleUseCase } from '../AuthenticateWithGoogleUseCase';
import { IAuthRepository } from '@domain/repositories/IAuthRepository';
import { AuthToken } from '@domain/entities/AuthToken';
import { AuthError } from '@domain/errors/AuthError';

describe('AuthenticateWithGoogleUseCase', () => {
  it('should return success when authentication succeeds', async () => {
    const mockToken: AuthToken = {
      accessToken: 'access',
      idToken: 'id',
      expiresAt: new Date(),
    };

    const mockRepo: IAuthRepository = {
      authenticateWithGoogle: vi.fn().mockResolvedValue(mockToken),
      getCurrentUser: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      isAuthenticated: vi.fn(),
    };

    const useCase = new AuthenticateWithGoogleUseCase(mockRepo);
    const result = await useCase.execute({ credential: 'cred', clientId: 'client' });

    expect(result.isSuccess()).toBe(true);
    expect(result.getValue()).toEqual(mockToken);
  });

  it('should return failure when authentication fails', async () => {
    const mockRepo: IAuthRepository = {
      authenticateWithGoogle: vi.fn().mockRejectedValue(new AuthError('Failed', 'AUTH_FAILED')),
      getCurrentUser: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      isAuthenticated: vi.fn(),
    };

    const useCase = new AuthenticateWithGoogleUseCase(mockRepo);
    const result = await useCase.execute({ credential: 'cred', clientId: 'client' });

    expect(result.isFailure()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AuthError);
  });
});
