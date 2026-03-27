import { ResourceAction } from '../entities/Resource';
import { UserPermissions } from '../entities/User';

export interface IAuthorizationRepository {
  checkPermission(action: ResourceAction): Promise<boolean>;
  getUserPermissions(resourceType: string): Promise<UserPermissions>;
  isAllowed(resource: string, action: string): Promise<boolean>;
}
