import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/hooks/useAuth';
import { useState, useEffect } from 'react';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { AppLayout } from '@presentation/components/templates/DashboardLayout';
import { JobsEmbeddedSection } from '@presentation/components/features/worker/JobsEmbeddedSection';
import { useWorkerNavItems } from '@presentation/config/workerNavigation';
import { TopNavbar } from '@presentation/components/templates/DashboardLayout/TopNavbar';
import { ProfileCompletionCard } from '@presentation/components/organisms/ProfileCompletionCard';
import { useWorkerProfileProgress } from '@presentation/hooks/useWorkerProfileProgress';
import type { WorkerProgressResponse } from '@infrastructure/http/WorkerApiService';

export const WorkerHome = (): JSX.Element => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getProgress } = useWorkerApi();
  const [workerData, setWorkerData] = useState<WorkerProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navItems = useWorkerNavItems();
  const { progress, isComplete } = useWorkerProfileProgress(workerData);

  useEffect(() => {
    const fetchWorkerData = async () => {
      if (!user?.id) return;
      
      try {
        const data = await getProgress();
        setWorkerData(data);
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
        setWorkerData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkerData();
  }, [user?.id, getProgress]);

  const handleActionClick = (): void => {
    if (progress.nextAction) {
      navigate(progress.nextAction.route);
    }
  };

  return (
    <AppLayout navItems={navItems} userName={user?.name || 'Usuário'}>
      <TopNavbar userName={user?.name || 'Usuário'} className="w-full mb-6" />
      
      {!isLoading && !isComplete && (
        <ProfileCompletionCard
          progress={progress}
          onActionClick={handleActionClick}
          className="mb-8"
        />
      )}

      <JobsEmbeddedSection />
    </AppLayout>
  );
};
