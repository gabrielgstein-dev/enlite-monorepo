import { useUserRole } from '@presentation/hooks/useUserRole';
import { UserRole } from '@domain/enums/UserRole';
import { WorkerHome } from './WorkerHome';
import { AdminHome } from './AdminHome';
import { ManagerHome } from './ManagerHome';
import { ClientHome } from './ClientHome';
import { SupportHome } from './SupportHome';

const roleComponentMap: Record<UserRole, React.FC> = {
  [UserRole.WORKER]: WorkerHome,
  [UserRole.ADMIN]: AdminHome,
  [UserRole.MANAGER]: ManagerHome,
  [UserRole.CLIENT]: ClientHome,
  [UserRole.SUPPORT]: SupportHome,
};

export function RoleBasedHome() {
  const { primaryRole, isWorker } = useUserRole();

  // Se não tem role definida, assume worker como padrão
  const effectiveRole = primaryRole || (isWorker ? UserRole.WORKER : UserRole.CLIENT);

  const HomeComponent = effectiveRole
    ? roleComponentMap[effectiveRole]
    : roleComponentMap[UserRole.CLIENT];

  return <HomeComponent />;
}
