import { useTranslation } from 'react-i18next';
import { useUserRole } from '@presentation/hooks/useUserRole';
import { useAuth } from '@presentation/contexts/useAuth';
import { roleLabels } from '@domain/enums/UserRole';

export function AdminHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { primaryRole } = useUserRole();

  return (
    <div className="home-page admin-home">
      <header className="home-header">
        <h1>{t('home.admin.title')}</h1>
        <p className="welcome-message">
          {t('home.welcome', { name: user?.name })}
        </p>
        <span className="role-badge admin">{primaryRole ? roleLabels[primaryRole] : ''}</span>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>{t('home.admin.users')}</h2>
          <p>{t('home.admin.usersDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.admin.workers')}</h2>
          <p>{t('home.admin.workersDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.admin.platformSettings')}</h2>
          <p>{t('home.admin.settingsDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.admin.reports')}</h2>
          <p>{t('home.admin.reportsDescription')}</p>
        </section>
      </div>
    </div>
  );
}
