import { IAuthRepository } from '@domain/repositories/IAuthRepository';
import { GoogleCredential, AuthToken } from '@domain/entities/AuthToken';
import { Result } from '@domain/value-objects/Result';
import { AuthError } from '@domain/errors/AuthError';

export class AuthenticateWithGoogleUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(credential: GoogleCredential): Promise<Result<AuthToken, AuthError>> {
    try {
      const token = await this.authRepository.authenticateWithGoogle(credential);
      return Result.ok<AuthToken, AuthError>(token);
    } catch (error) {
      const authError = error instanceof AuthError 
        ? error 
        : new AuthError('Authentication failed', 'AUTH_FAILED');
      return Result.fail(authError);
    }
  }
}
