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
  loginWithGoogle: () => Promise<void>;
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
  const loginWithGoogle = useAdminAuthStore((s) => s.loginWithGoogle);
  const logout = useAdminAuthStore((s) => s.logout);
  const fetchProfile = useAdminAuthStore((s) => s.fetchProfile);
  const initialize = useAdminAuthStore((s) => s.initialize);

  useEffect(() => {
    console.log('[useAdminAuth] Inicializando auth...');
    const unsubscribe = initialize();
    return () => {
      console.log('[useAdminAuth] Limpando subscription');
      unsubscribe();
    };
  }, [initialize]);

  useEffect(() => {
    console.log('[useAdminAuth] Estado atualizado:', { isAuthenticated, isLoading, hasProfile: !!adminProfile, mustChangePassword });
  }, [isAuthenticated, isLoading, adminProfile, mustChangePassword]);

  return {
    user,
    adminProfile,
    isAuthenticated,
    isLoading,
    mustChangePassword,
    login,
    loginWithGoogle,
    logout,
    fetchProfile,
  };
}
