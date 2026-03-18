export class AuthorizationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ForbiddenError extends AuthorizationError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class PermissionDeniedError extends AuthorizationError {
  constructor(action: string, resource: string) {
    super(`Permission denied for ${action} on ${resource}`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
  }
}
