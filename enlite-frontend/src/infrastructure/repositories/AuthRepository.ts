import { IAuthRepository } from '@domain/repositories/IAuthRepository';
import { AuthToken, GoogleCredential } from '@domain/entities/AuthToken';
import { User } from '@domain/entities/User';
import { HttpClient } from '../http/HttpClient';
import { TokenStorage } from '../storage/TokenStorage';
import { UnauthorizedError } from '@domain/errors/AuthError';

export class AuthRepository implements IAuthRepository {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly tokenStorage: TokenStorage
  ) {}

  async authenticateWithGoogle(credential: GoogleCredential): Promise<AuthToken> {
    const response = await this.httpClient.post<AuthToken>('/auth/google', credential);
    
    if (response.status !== 200) {
      throw new UnauthorizedError('Google authentication failed');
    }

    this.tokenStorage.save(response.data);
    return response.data;
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    const token = this.tokenStorage.get();
    const response = await this.httpClient.get<User>('/auth/me', {
      Authorization: `Bearer ${token?.accessToken}`,
    });

    return response.data;
  }

  async logout(): Promise<void> {
    this.tokenStorage.remove();
  }

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    const response = await this.httpClient.post<AuthToken>('/auth/refresh', { refreshToken });
    this.tokenStorage.save(response.data);
    return response.data;
  }

  isAuthenticated(): boolean {
    return !this.tokenStorage.isExpired();
  }
}
