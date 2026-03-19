import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/contexts/useAuth';
import { useState, useEffect } from 'react';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { AppLayout } from '@presentation/components/layout';
import { JobVacanciesSection } from '@presentation/components/worker/JobVacanciesSection';
import { workerNavItems } from '@presentation/config/workerNavigation';

export const WorkerHome = (): JSX.Element => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getProgress } = useWorkerApi();
  const [registrationCompleted, setRegistrationCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkRegistrationStatus = async () => {
      if (!user?.id) return;
      
      try {
        const progress = await getProgress();
        setRegistrationCompleted(progress.registrationCompleted ?? false);
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
        setRegistrationCompleted(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkRegistrationStatus();
  }, [user?.id, getProgress]);

  return (
    <AppLayout navItems={workerNavItems} userName={user?.name || 'Usuário'}>
      {/* Incomplete Registration Banner */}
      {!isLoading && registrationCompleted === false && (
        <div className="w-full bg-amber-50 border-b-2 border-amber-200 px-8 py-4 mb-8 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-poppins font-semibold text-amber-900">
                  {t('home.worker.incompleteRegistration.title', 'Complete seu cadastro')}
                </p>
                <p className="font-lexend text-sm text-amber-800">
                  {t('home.worker.incompleteRegistration.description', 'Finalize seu cadastro para começar a receber oportunidades de trabalho')}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/worker-registration')}
              className="px-6 py-2 bg-amber-600 text-white rounded-full font-poppins font-semibold hover:bg-amber-700 transition-colors"
            >
              {t('home.worker.incompleteRegistration.action', 'Completar Cadastro')}
            </button>
          </div>
        </div>
      )}

      {/* Work Summary Cards Section */}
      {/* <div className="mb-8">
        <WorkSummaryCardsSection />
      </div> */}

      {/* Dashboard Info Cards Section */}
     {/*  <div className="mb-8">
        <DashboardInfoCardsSection />
      </div> */}

      {/* Job Vacancies Section */}
      <JobVacanciesSection />
    </AppLayout>
  );
};
