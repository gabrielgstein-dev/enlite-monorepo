import { WorkerSidebar } from '../../components/worker/WorkerSidebar';
import { TopNavbar } from '../../components/layout/TopNavbar';
import { WorkSummarySection } from '../../components/worker/WorkSummarySection';
import { DashboardInfoSection } from '../../components/worker/DashboardInfoSection';
import { JobVacanciesSection } from '../../components/worker/JobVacanciesSection';

export const HomeWorkerPage = () => {
  return (
    <div className="relative w-full min-h-screen bg-graygray-100-bg-web">
      <WorkerSidebar />
      
      <div className="ml-60 px-8 py-8">
        <TopNavbar 
          userName="Alberto" 
          className="w-full mb-6"
        />
        
        <WorkSummarySection />
        <DashboardInfoSection />
        <JobVacanciesSection />
      </div>
    </div>
  );
};
