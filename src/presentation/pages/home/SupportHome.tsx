import { useTranslation } from 'react-i18next';
import { useUserRole } from '@presentation/hooks/useUserRole';
import { useAuth } from '@presentation/contexts/useAuth';
import { roleLabels } from '@domain/enums/UserRole';

export function SupportHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { primaryRole } = useUserRole();

  return (
    <div className="home-page support-home">
      <header className="home-header">
        <h1>{t('home.support.title')}</h1>
        <p className="welcome-message">
          {t('home.welcome', { name: user?.name })}
        </p>
        <span className="role-badge support">{primaryRole ? roleLabels[primaryRole] : ''}</span>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>{t('home.support.tickets')}</h2>
          <p>{t('home.support.ticketsDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.support.liveChat')}</h2>
          <p>{t('home.support.chatDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.support.knowledgeBase')}</h2>
          <p>{t('home.support.kbDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.support.userIssues')}</h2>
          <p>{t('home.support.issuesDescription')}</p>
        </section>
      </div>
    </div>
  );
}
