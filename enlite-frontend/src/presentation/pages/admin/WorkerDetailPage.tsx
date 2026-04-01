import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DetailSkeleton } from '@presentation/components/ui/skeletons';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { useWorkerDetail } from '@hooks/admin/useWorkerDetail';
import { WorkerStatusCard } from '@presentation/components/features/admin/WorkerDetail/WorkerStatusCard';
import { WorkerPersonalCard } from '@presentation/components/features/admin/WorkerDetail/WorkerPersonalCard';
import { WorkerProfessionalCard } from '@presentation/components/features/admin/WorkerDetail/WorkerProfessionalCard';
import { WorkerLocationCard } from '@presentation/components/features/admin/WorkerDetail/WorkerLocationCard';
import { WorkerDocumentsCard } from '@presentation/components/features/admin/WorkerDetail/WorkerDocumentsCard';
import { WorkerEncuadresCard } from '@presentation/components/features/admin/WorkerDetail/WorkerEncuadresCard';

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { worker, isLoading, error } = useWorkerDetail(id);

  if (isLoading) return <DetailSkeleton />;

  if (error || !worker) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex flex-col items-center justify-center gap-4">
        <Typography variant="h3" className="text-red-600">
          {error ?? t('admin.workerDetail.notFound')}
        </Typography>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/workers')}>
          {t('admin.workerDetail.back')}
        </Button>
      </div>
    );
  }

  const fullName = [worker.firstName, worker.lastName].filter(Boolean).join(' ') || worker.email;

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[120px] py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/workers')}
            className="flex items-center gap-1 text-[#737373] hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <Typography variant="body" weight="medium" className="text-inherit">
              {t('admin.workerDetail.back')}
            </Typography>
          </button>
          <ChevronRight className="w-4 h-4 text-[#D9D9D9]" />
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            {fullName}
          </Typography>
        </div>
      </div>

      {/* Row 1: Status + Personal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <WorkerStatusCard
          status={worker.status}
          isMatchable={worker.isMatchable}
          isActive={worker.isActive}
          dataSources={worker.dataSources}
          platform={worker.platform}
          createdAt={worker.createdAt}
          updatedAt={worker.updatedAt}
        />
        <WorkerPersonalCard
          firstName={worker.firstName}
          lastName={worker.lastName}
          email={worker.email}
          phone={worker.phone}
          whatsappPhone={worker.whatsappPhone}
          profilePhotoUrl={worker.profilePhotoUrl}
          birthDate={worker.birthDate}
          documentType={worker.documentType}
          documentNumber={worker.documentNumber}
          sex={worker.sex}
          gender={worker.gender}
        />
      </div>

      {/* Row 2: Professional + Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <WorkerProfessionalCard
          profession={worker.profession}
          occupation={worker.occupation}
          knowledgeLevel={worker.knowledgeLevel}
          titleCertificate={worker.titleCertificate}
          experienceTypes={worker.experienceTypes}
          yearsExperience={worker.yearsExperience}
          preferredTypes={worker.preferredTypes}
          preferredAgeRange={worker.preferredAgeRange}
          languages={worker.languages}
          linkedinUrl={worker.linkedinUrl}
        />
        <WorkerLocationCard
          serviceAreas={worker.serviceAreas}
          location={worker.location}
        />
      </div>

      {/* Row 3: Documents (full-width) */}
      <div className="mb-6">
        <WorkerDocumentsCard documents={worker.documents} />
      </div>

      {/* Row 4: Encuadres (full-width) */}
      <div className="mb-6">
        <WorkerEncuadresCard encuadres={worker.encuadres} />
      </div>
    </div>
  );
}
