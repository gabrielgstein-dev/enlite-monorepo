import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DetailSkeleton } from '@presentation/components/ui/skeletons';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { useWorkerDetail } from '@hooks/admin/useWorkerDetail';
import { useAdminWorkerDocuments } from '@hooks/admin/useAdminWorkerDocuments';
import { WorkerContactCard } from '@presentation/components/features/admin/WorkerDetail/WorkerContactCard';
import { WorkerPersonalInfoCard } from '@presentation/components/features/admin/WorkerDetail/WorkerPersonalInfoCard';
import { WorkerAddressCard } from '@presentation/components/features/admin/WorkerDetail/WorkerAddressCard';
import { WorkerProfileTabs, WorkerTab } from '@presentation/components/features/admin/WorkerDetail/WorkerProfileTabs';
import { WorkerDocumentsCard } from '@presentation/components/features/admin/WorkerDetail/WorkerDocumentsCard';
import { WorkerEncuadresCard } from '@presentation/components/features/admin/WorkerDetail/WorkerEncuadresCard';
import { WorkerProfessionalCard } from '@presentation/components/features/admin/WorkerDetail/WorkerProfessionalCard';
import { WorkerAvailabilityCard } from '@presentation/components/features/admin/WorkerDetail/WorkerAvailabilityCard';

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { worker, isLoading, error, refetch } = useWorkerDetail(id);
  const [activeTab, setActiveTab] = useState<WorkerTab>('documents');
  const docs = useAdminWorkerDocuments(id ?? '', refetch);

  if (isLoading) return <DetailSkeleton />;

  if (error || !worker) {
    return (
      <div className="w-full min-h-screen bg-background flex flex-col items-center justify-center gap-4">
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
    <div className="w-full min-h-screen bg-background px-4 sm:px-8 lg:px-12 xl:px-[120px] py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/workers')}
            className="flex items-center gap-1 text-gray-800 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <Typography variant="body" weight="medium" className="text-inherit">
              {t('admin.workerDetail.back')}
            </Typography>
          </button>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <Typography variant="h1" weight="semibold" color="primary">
            {fullName}
          </Typography>
        </div>
      </div>

      {/* Row 1: Contact + Personal Info (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <WorkerContactCard
          status={worker.status}
          firstName={worker.firstName}
          lastName={worker.lastName}
          email={worker.email}
          phone={worker.phone}
          whatsappPhone={worker.whatsappPhone}
          profilePhotoUrl={worker.profilePhotoUrl}
          documentType={worker.documentType}
          documentNumber={worker.documentNumber}
          platform={worker.platform}
          dataSources={worker.dataSources}
          createdAt={worker.createdAt}
          updatedAt={worker.updatedAt}
        />
        <WorkerPersonalInfoCard
          birthDate={worker.birthDate}
          sex={worker.sex}
          gender={worker.gender}
          sexualOrientation={worker.sexualOrientation}
          race={worker.race}
          religion={worker.religion}
          languages={worker.languages}
          weightKg={worker.weightKg}
          heightCm={worker.heightCm}
        />
      </div>

      {/* Row 2: Address (full-width) */}
      <div className="mb-6">
        <WorkerAddressCard
          serviceAreas={worker.serviceAreas}
          location={worker.location}
        />
      </div>

      {/* Row 3: Professional Data (full-width) */}
      <div className="mb-6">
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
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <WorkerProfileTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      <div className="mb-6">
        {activeTab === 'encuadres' && (
          <WorkerEncuadresCard encuadres={worker.encuadres} />
        )}
        {activeTab === 'documents' && (
          <WorkerDocumentsCard
            documents={worker.documents}
            onUpload={docs.uploadDocument}
            onDelete={docs.deleteDocument}
            onView={docs.viewDocument}
            loadingTypes={docs.loadingTypes}
            errors={docs.errors}
          />
        )}
        {activeTab === 'availability' && (
          <WorkerAvailabilityCard availability={worker.availability ?? []} />
        )}
        {activeTab === 'financial' && (
          <PlaceholderTab label={t('admin.workerDetail.tabs.financial')} />
        )}
        {activeTab === 'history' && (
          <PlaceholderTab label={t('admin.workerDetail.tabs.history')} />
        )}
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10 flex items-center justify-center min-h-[200px]">
      <Typography variant="body" className="text-gray-700">
        {label} — {t('admin.workerDetail.comingSoon')}
      </Typography>
    </div>
  );
}
