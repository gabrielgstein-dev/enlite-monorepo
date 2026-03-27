import { IAuthRepository } from '@domain/repositories/IAuthRepository';
import { User } from '@domain/entities/User';
import { Result } from '@domain/value-objects/Result';
import { AuthError } from '@domain/errors/AuthError';

export class GetCurrentUserUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(): Promise<Result<User | null, AuthError>> {
    try {
      const user = await this.authRepository.getCurrentUser();
      return Result.ok<User | null, AuthError>(user);
    } catch (error) {
      const authError = error instanceof AuthError 
        ? error 
        : new AuthError('Failed to get current user', 'GET_USER_FAILED');
      return Result.fail(authError);
    }
  }
}
