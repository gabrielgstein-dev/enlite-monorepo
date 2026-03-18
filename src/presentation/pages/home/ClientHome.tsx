import { useTranslation } from 'react-i18next';
import { useUserRole } from '@presentation/hooks/useUserRole';
import { useAuth } from '@presentation/contexts/useAuth';
import { roleLabels } from '@domain/enums/UserRole';

export function ClientHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { primaryRole } = useUserRole();

  return (
    <div className="home-page client-home">
      <header className="home-header">
        <h1>{t('home.client.title')}</h1>
        <p className="welcome-message">
          {t('home.welcome', { name: user?.name })}
        </p>
        <span className="role-badge client">{primaryRole ? roleLabels[primaryRole] : ''}</span>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>{t('home.client.myAppointments')}</h2>
          <p>{t('home.client.appointmentsDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.client.findProfessional')}</h2>
          <p>{t('home.client.findDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.client.healthHistory')}</h2>
          <p>{t('home.client.historyDescription')}</p>
        </section>

        <section className="dashboard-card">
          <h2>{t('home.client.messages')}</h2>
          <p>{t('home.client.messagesDescription')}</p>
        </section>
      </div>
    </div>
  );
}
