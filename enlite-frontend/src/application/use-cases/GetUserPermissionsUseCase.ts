import { IAuthorizationRepository } from '@domain/repositories/IAuthorizationRepository';
import { UserPermissions } from '@domain/entities/User';
import { Result } from '@domain/value-objects/Result';
import { AuthorizationError } from '@domain/errors/AuthorizationError';

export class GetUserPermissionsUseCase {
  constructor(private readonly authzRepository: IAuthorizationRepository) {}

  async execute(resourceType: string): Promise<Result<UserPermissions, AuthorizationError>> {
    try {
      const permissions = await this.authzRepository.getUserPermissions(resourceType);
      return Result.ok<UserPermissions, AuthorizationError>(permissions);
    } catch (error) {
      const authzError = error instanceof AuthorizationError 
        ? error 
        : new AuthorizationError('Failed to get permissions', 'GET_PERMISSIONS_FAILED');
      return Result.fail(authzError);
    }
  }
}
