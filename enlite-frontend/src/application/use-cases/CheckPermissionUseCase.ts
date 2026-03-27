import { IAuthorizationRepository } from '@domain/repositories/IAuthorizationRepository';
import { ResourceAction } from '@domain/entities/Resource';
import { Result } from '@domain/value-objects/Result';
import { AuthorizationError } from '@domain/errors/AuthorizationError';

export class CheckPermissionUseCase {
  constructor(private readonly authzRepository: IAuthorizationRepository) {}

  async execute(action: ResourceAction): Promise<Result<boolean, AuthorizationError>> {
    try {
      const allowed = await this.authzRepository.checkPermission(action);
      return Result.ok<boolean, AuthorizationError>(allowed);
    } catch (error) {
      const authzError = error instanceof AuthorizationError 
        ? error 
        : new AuthorizationError('Permission check failed', 'CHECK_FAILED');
      return Result.fail(authzError);
    }
  }
}
