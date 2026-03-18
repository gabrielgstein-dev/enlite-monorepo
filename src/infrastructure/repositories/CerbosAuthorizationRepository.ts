import { IAuthorizationRepository } from '@domain/repositories/IAuthorizationRepository';
import { ResourceAction } from '@domain/entities/Resource';
import { UserPermissions } from '@domain/entities/User';
import { HTTP as Cerbos } from '@cerbos/http';
import { ForbiddenError } from '@domain/errors/AuthorizationError';

export class CerbosAuthorizationRepository implements IAuthorizationRepository {
  constructor(
    private readonly cerbos: Cerbos,
    private readonly getCurrentUserId: () => string | null
  ) {}

  async checkPermission(action: ResourceAction): Promise<boolean> {
    const userId = this.getCurrentUserId();
    if (!userId) return false;

    const result = await this.cerbos.checkResource({
      principal: { id: userId, roles: [] },
      resource: {
        kind: action.resource.type,
        id: action.resource.id,
        attr: action.resource.attributes as Record<string, string | number | boolean | null>,
      },
      actions: [action.action],
    });

    return result.isAllowed(action.action) ?? false;
  }

  async getUserPermissions(resourceType: string): Promise<UserPermissions> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    const actions = ['read', 'write', 'delete', 'manage'];
    const result = await this.cerbos.checkResource({
      principal: { id: userId, roles: [] },
      resource: { kind: resourceType, id: 'temp' },
      actions,
    });

    return {
      canRead: result.isAllowed('read') ?? false,
      canWrite: result.isAllowed('write') ?? false,
      canDelete: result.isAllowed('delete') ?? false,
      canManage: result.isAllowed('manage') ?? false,
    };
  }

  async isAllowed(resource: string, action: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    if (!userId) return false;

    const result = await this.cerbos.checkResource({
      principal: { id: userId, roles: [] },
      resource: { kind: resource, id: 'temp' },
      actions: [action],
    });

    return result.isAllowed(action) ?? false;
  }
}
