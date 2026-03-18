import { useTranslation } from 'react-i18next';
import { useUserRole } from '@presentation/hooks/useUserRole';
import { useAuth } from '@presentation/contexts/useAuth';
import { roleLabels } from '@domain/enums/UserRole';

export function ManagerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { primaryRole } = useUserRole();

  return (
    <div className="home-page manager-home">
      <header className="home-header">
        <h1>{t('home.manager.title')}</h1>
        <p className="welcome-message">
          {t('home.welcome', { name: user?.name })}
        </p>
        <span className="role-badge manager">{primaryRole ? roleLabels[primaryRole] : ''}</span>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>{t('home.manager.teamOverview')}</h2>
          <p>{t('home.manager.teamDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.manager.schedule')}</h2>
          <p>{t('home.manager.scheduleDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.manager.performance')}</h2>
          <p>{t('home.manager.performanceDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.manager.analytics')}</h2>
          <p>{t('home.manager.analyticsDescription')}</p>
        </section>
      </div>
    </div>
  );
}
