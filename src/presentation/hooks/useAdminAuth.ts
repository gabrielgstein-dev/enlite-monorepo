import { useEffect } from 'react';
import { useAdminAuthStore } from '@presentation/stores/adminAuthStore';
import { User } from '@domain/entities/User';
import { AdminUser } from '@domain/entities/AdminUser';

interface UseAdminAuthReturn {
  user: User | null;
  adminProfile: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const user = useAdminAuthStore((s) => s.user);
  const adminProfile = useAdminAuthStore((s) => s.adminProfile);
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const isLoading = useAdminAuthStore((s) => s.isLoading);
  const mustChangePassword = useAdminAuthStore((s) => s.mustChangePassword);
  const login = useAdminAuthStore((s) => s.login);
  const logout = useAdminAuthStore((s) => s.logout);
  const fetchProfile = useAdminAuthStore((s) => s.fetchProfile);
  const initialize = useAdminAuthStore((s) => s.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, [initialize]);

  return {
    user,
    adminProfile,
    isAuthenticated,
    isLoading,
    mustChangePassword,
    login,
    logout,
    fetchProfile,
  };
}
