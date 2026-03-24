import { ReactNode, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/hooks/useAuth';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';

interface AdminLoginGuardProps {
  children: ReactNode;
}

/**
 * Guard para a página de login admin
 * 
 * Proteções:
 * 1. Se usuário worker está autenticado, redireciona para /
 * 2. Se admin já está autenticado, redireciona para /admin
 * 3. Caso contrário, permite acesso à página de login
 */
export function AdminLoginGuard({ children }: AdminLoginGuardProps): JSX.Element {
  const navigate = useNavigate();
  const { isAuthenticated: isWorkerAuth, isLoading: isWorkerLoading, user: workerUser } = useAuth();
  const { isAuthenticated: isAdminAuth, isLoading: isAdminLoading, adminProfile } = useAdminAuth();

  useEffect(() => {
    // Aguarda carregamento completo
    if (isWorkerLoading || isAdminLoading) return;

    // Se admin já está autenticado, redireciona para painel admin
    if (isAdminAuth && adminProfile) {
      console.log('[AdminLoginGuard] Admin já autenticado, redirecionando para /admin');
      navigate('/admin', { replace: true });
      return;
    }

    // Se worker está autenticado, bloqueia acesso ao login admin
    if (isWorkerAuth && workerUser) {
      console.warn('[AdminLoginGuard] Tentativa de acesso ao login admin por usuário worker bloqueada');
      navigate('/', { replace: true });
    }
  }, [isWorkerAuth, isAdminAuth, isWorkerLoading, isAdminLoading, workerUser, adminProfile, navigate]);

  // Loading state
  if (isWorkerLoading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Se admin já autenticado, redireciona
  if (isAdminAuth && adminProfile) {
    return <Navigate to="/admin" replace />;
  }

  // Se worker autenticado, bloqueia
  if (isWorkerAuth && workerUser) {
    return <Navigate to="/" replace />;
  }

  // Permite acesso à página de login
  return <>{children}</>;
}
