import { AppLayout } from '../../components/layout';
import { TopNavbar } from '../../components/layout/TopNavbar';
import { WorkSummaryCardsSection } from '../../components/worker/WorkSummarySection';
import { DashboardInfoCardsSection } from '../../components/worker/DashboardInfoSection';
import { JobVacanciesSection } from '../../components/worker/JobVacanciesSection';
import { workerNavItems } from '../../config/workerNavigation';

export const HomeWorkerPage = (): JSX.Element => {
  return (
    <AppLayout navItems={workerNavItems} userName="Alberto">
      <TopNavbar userName="Alberto" className="w-full mb-6" />
      <WorkSummaryCardsSection />
      <DashboardInfoCardsSection />
      <JobVacanciesSection />
    </AppLayout>
  );
};
