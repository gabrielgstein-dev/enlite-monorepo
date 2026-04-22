import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';

interface AdminProtectedRouteProps {
  children: ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { isAuthenticated, isLoading, adminProfile } = useAdminAuth();

  console.log('[AdminProtectedRoute] Estado:', { isAuthenticated, isLoading, hasProfile: !!adminProfile });

  if (isLoading) {
    console.log('[AdminProtectedRoute] Carregando...');
    return null;
  }

  if (!isAuthenticated) {
    console.log('[AdminProtectedRoute] Não autenticado, redirecionando para login');
    return <Navigate to="/admin/login" replace />;
  }

  if (!adminProfile) {
    console.log('[AdminProtectedRoute] Sem perfil admin, redirecionando para login');
    return <Navigate to="/admin/login" replace />;
  }

  console.log('[AdminProtectedRoute] Autorizado, renderizando children');
  return <>{children}</>;
}
