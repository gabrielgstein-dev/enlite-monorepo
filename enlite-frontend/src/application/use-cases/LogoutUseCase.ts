import { IAuthRepository } from '@domain/repositories/IAuthRepository';
import { Result } from '@domain/value-objects/Result';
import { AuthError } from '@domain/errors/AuthError';

export class LogoutUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(): Promise<Result<void, AuthError>> {
    try {
      await this.authRepository.logout();
      return Result.ok<void, AuthError>(undefined);
    } catch (error) {
      const authError = error instanceof AuthError 
        ? error 
        : new AuthError('Logout failed', 'LOGOUT_FAILED');
      return Result.fail(authError);
    }
  }
}
