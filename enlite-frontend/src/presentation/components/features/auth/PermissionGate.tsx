import { ReactNode } from 'react';
import { usePermissions } from '@presentation/hooks/usePermissions';

interface PermissionGateProps {
  children: ReactNode;
  resourceType: string;
  action: 'read' | 'write' | 'delete' | 'manage';
  fallback?: ReactNode;
}

export function PermissionGate({ children, resourceType, action, fallback }: PermissionGateProps) {
  const { permissions, isLoading } = usePermissions(resourceType);

  if (isLoading) {
    return <>{fallback || null}</>;
  }

  const permissionMap = {
    read: permissions.canRead,
    write: permissions.canWrite,
    delete: permissions.canDelete,
    manage: permissions.canManage,
  };

  const hasPermission = permissionMap[action];

  return <>{hasPermission ? children : fallback || null}</>;
}
