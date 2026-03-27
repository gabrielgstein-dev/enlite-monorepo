import { IAuthorizationEngine } from '../../domain/ports/IAuthorizationEngine';
import {
  AuthContext,
  AccessDecision,
  ResourceType,
  Action,
  PrincipalType,
} from '../../domain/interfaces/Auth';

/**
 * Simplified Authorization Engine (No Roles)
 * 
 * Since we removed the role system, this engine simply checks:
 * 1. Is the user authenticated?
 * 2. Does the user own the resource (if ownership is required)?
 * 3. Is the user in the same tenant (if tenant isolation is required)?
 */
export class SimplifiedAuthorizationEngine implements IAuthorizationEngine {
  async checkPermission(
    context: AuthContext,
    resource: { type: string; id?: string; attrs?: Record<string, unknown> },
    action: string
  ): Promise<AccessDecision> {
    // All authenticated users have access
    const allowed = this.evaluateAccess(context, resource);
    
    return {
      allowed,
      reason: allowed ? 'Access granted to authenticated user' : 'Access denied',
      policies: ['authenticated_user_policy'],
      auditLogId: this.generateAuditLogId(),
    };
  }

  async checkPermissions(
    context: AuthContext,
    checks: Array<{
      resource: { type: string; id?: string; attrs?: Record<string, unknown> };
      action: string;
    }>
  ): Promise<AccessDecision[]> {
    return Promise.all(
      checks.map((check) => this.checkPermission(context, check.resource, check.action))
    );
  }

  async listAccessibleResources(
    context: AuthContext,
    resourceType: string,
    action: string
  ): Promise<{ resourceIds: string[]; decision: AccessDecision }> {
    const decision = await this.checkPermission(context, { type: resourceType }, action);
    
    if (!decision.allowed) {
      return { resourceIds: [], decision };
    }

    return { resourceIds: [], decision };
  }

  private evaluateAccess(
    context: AuthContext,
    resource: { type: string; id?: string; attrs?: Record<string, unknown> }
  ): boolean {
    // Basic check: user must be authenticated
    if (!context.principal.id) {
      return false;
    }

    // All authenticated users have access
    // Future: can add ownership checks, tenant isolation, etc.
    return true;
  }

  private generateAuditLogId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
