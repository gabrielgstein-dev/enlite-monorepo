import { AuthToken, GoogleCredential } from '../entities/AuthToken';
import { User } from '../entities/User';

export interface IAuthRepository {
  authenticateWithGoogle(credential: GoogleCredential): Promise<AuthToken>;
  getCurrentUser(): Promise<User | null>;
  logout(): Promise<void>;
  refreshToken(refreshToken: string): Promise<AuthToken>;
  isAuthenticated(): boolean;
}
