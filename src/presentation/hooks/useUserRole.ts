import { useMemo } from 'react';
import { useAuth } from '@presentation/contexts/useAuth';
import { UserRole, isValidRole } from '@domain/enums/UserRole';

interface UseUserRoleReturn {
  primaryRole: UserRole | null;
  roles: UserRole[];
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  isClient: boolean;
  isSupport: boolean;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();

  const roles = useMemo(() => {
    if (!user?.roles) return [];
    return user.roles
      .filter((role): role is string => typeof role === 'string')
      .filter(isValidRole);
  }, [user?.roles]);

  const primaryRole = roles[0] || null;

  const hasRole = (role: UserRole): boolean => roles.includes(role);

  const hasAnyRole = (checkRoles: UserRole[]): boolean =>
    checkRoles.some((role) => roles.includes(role));

  return {
    primaryRole,
    roles,
    hasRole,
    hasAnyRole,
    isAdmin: hasRole(UserRole.ADMIN),
    isManager: hasRole(UserRole.MANAGER),
    isWorker: hasRole(UserRole.WORKER),
    isClient: hasRole(UserRole.CLIENT),
    isSupport: hasRole(UserRole.SUPPORT),
  };
}
