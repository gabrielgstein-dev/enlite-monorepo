import { AuthContext, AccessDecision } from '../domain/Auth';

/**
 * Port for Authorization Engine (Cerbos Adapter)
 * 
 * This interface abstracts the authorization engine, allowing us to:
 * 1. Start with a simple local implementation
 * 2. Migrate to Cerbos without changing business logic
 */
export interface IAuthorizationEngine {
  /**
   * Check if principal can perform action on resource
   */
  checkPermission(
    context: AuthContext,
    resource: { type: string; id?: string; attrs?: Record<string, unknown> },
    action: string
  ): Promise<AccessDecision>;

  /**
   * Check multiple permissions at once
   */
  checkPermissions(
    context: AuthContext,
    checks: Array<{
      resource: { type: string; id?: string; attrs?: Record<string, unknown> };
      action: string;
    }>
  ): Promise<AccessDecision[]>;

  /**
   * List all resources a principal can access
   */
  listAccessibleResources(
    context: AuthContext,
    resourceType: string,
    action: string
  ): Promise<{ resourceIds: string[]; decision: AccessDecision }>;
}
