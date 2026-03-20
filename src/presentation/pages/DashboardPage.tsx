import { useAuth } from '@presentation/hooks/useAuth';
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="dashboard-page">
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.welcome', { name: user?.name })}</p>
      <div className="dashboard-content">
        <p>{t('dashboard.yourRoles', { roles: user?.roles.join(', ') })}</p>
      </div>
    </div>
  );
}
