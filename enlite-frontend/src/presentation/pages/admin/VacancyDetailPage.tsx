import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Sparkles, Pencil } from 'lucide-react';
import { DetailSkeleton } from '@presentation/components/ui/skeletons';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { useVacancyDetail } from '@hooks/admin/useVacancyDetail';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { VacancyStatusCard } from '@presentation/components/features/admin/VacancyDetail/VacancyStatusCard';
import { VacancyPatientCard } from '@presentation/components/features/admin/VacancyDetail/VacancyPatientCard';
import { VacancyRequirementsCard } from '@presentation/components/features/admin/VacancyDetail/VacancyRequirementsCard';
import { VacancyScheduleCard } from '@presentation/components/features/admin/VacancyDetail/VacancyScheduleCard';
import { VacancyEncuadresCard } from '@presentation/components/features/admin/VacancyDetail/VacancyEncuadresCard';
import { VacancyMeetLinksCard } from '@presentation/components/features/admin/VacancyDetail/VacancyMeetLinksCard';
import { VacancyFormModal } from '@presentation/components/features/admin/VacancyFormModal';
import { VacancyPrescreeningConfig } from '@presentation/components/features/admin/VacancyDetail/VacancyPrescreeningConfig';
import { VacancyTalentumCard } from '@presentation/components/features/admin/VacancyDetail/VacancyTalentumCard';

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { vacancy, isLoading, error, refetch } = useVacancyDetail(id);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEnrich = async () => {
    if (!id) return;
    try {
      setIsEnriching(true);
      await AdminApiService.enrichVacancy(id);
      refetch();
    } catch (err) {
      console.error('[VacancyDetailPage] Enrich failed:', err);
    } finally {
      setIsEnriching(false);
    }
  };

  if (isLoading) return <DetailSkeleton />;

  if (error || !vacancy) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex flex-col items-center justify-center gap-4">
        <Typography variant="h3" className="text-red-600">
          {error ?? t('admin.vacancyDetail.notFound')}
        </Typography>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/vacancies')}>
          ← {t('admin.vacancyDetail.back')}
        </Button>
      </div>
    );
  }

  const patientName = [vacancy.patient_first_name, vacancy.patient_last_name]
    .filter(Boolean)
    .join(' ');
  const pageTitle = vacancy.case_number
    ? `${t('admin.vacancyDetail.case')} ${vacancy.case_number}${patientName ? ` — ${patientName}` : ''}`
    : vacancy.title ?? t('admin.vacancyDetail.vacancy');

  const publications: Array<{
    channel: string | null;
    published_at: string | null;
    recruiter: string | null;
  }> = vacancy.publications ?? [];

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[120px] py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/vacancies')}
            className="flex items-center gap-1 text-[#737373] hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <Typography variant="body" weight="medium" className="text-inherit">
              {t('admin.vacancyDetail.back')}
            </Typography>
          </button>
          <ChevronRight className="w-4 h-4 text-[#D9D9D9]" />
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            {pageTitle}
          </Typography>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEnrich}
            disabled={isEnriching}
            title={t('admin.vacancyDetail.enrichTooltip')}
            className="p-2 rounded-full border border-[#D9D9D9] hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
          >
            <Sparkles className={`w-4 h-4 ${isEnriching ? 'animate-pulse' : ''}`} />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-5"
          >
            <Pencil className="w-4 h-4" />
            {t('admin.vacancyDetail.edit')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/vacancies/${id}/kanban`)}
            className="flex items-center gap-2 px-5"
          >
            {t('admin.vacancyDetail.kanban')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/admin/vacancies/${id}/match`)}
            className="flex items-center gap-2 px-5"
          >
            {t('admin.vacancyDetail.viewMatch')}
          </Button>
        </div>
      </div>

      {/* Linha 1: Status + Paciente */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <VacancyStatusCard
          status={vacancy.status ?? '—'}
          country={vacancy.country ?? null}
          createdAt={vacancy.created_at ?? null}
          providersNeeded={vacancy.providers_needed ?? null}
          caseNumber={vacancy.case_number ?? null}
        />
        <VacancyPatientCard
          firstName={vacancy.patient_first_name ?? null}
          lastName={vacancy.patient_last_name ?? null}
          diagnosis={vacancy.patient_diagnosis ?? null}
          dependencyLevel={vacancy.dependency_level ?? null}
          zone={vacancy.patient_zone ?? null}
          insuranceVerified={vacancy.insurance_verified ?? null}
        />
      </div>

      {/* Linha 2: Requisitos LLM + Horário LLM */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <VacancyRequirementsCard
          llmRequiredSex={vacancy.llm_required_sex ?? null}
          llmRequiredProfession={vacancy.llm_required_profession ?? null}
          llmRequiredSpecialties={vacancy.llm_required_specialties ?? null}
          llmRequiredDiagnoses={vacancy.llm_required_diagnoses ?? null}
          llmEnrichedAt={vacancy.llm_enriched_at ?? null}
        />
        <VacancyScheduleCard
          llmParsedSchedule={vacancy.llm_parsed_schedule ?? null}
          scheduleDaysHours={vacancy.schedule_days_hours ?? null}
          llmEnrichedAt={vacancy.llm_enriched_at ?? null}
        />
      </div>

      {/* Links Google Meet */}
      <div className="mb-6">
        <VacancyMeetLinksCard
          vacancyId={id!}
          meetLink1={vacancy.meet_link_1 ?? null}
          meetDatetime1={vacancy.meet_datetime_1 ?? null}
          meetLink2={vacancy.meet_link_2 ?? null}
          meetDatetime2={vacancy.meet_datetime_2 ?? null}
          meetLink3={vacancy.meet_link_3 ?? null}
          meetDatetime3={vacancy.meet_datetime_3 ?? null}
          onSaved={refetch}
        />
      </div>

      {/* Encuadres */}
      <div className="mb-6">
        <VacancyEncuadresCard encuadres={vacancy.encuadres ?? []} onRefresh={refetch} />
      </div>

      {/* Prescreening Config */}
      <div className="mb-6">
        <VacancyPrescreeningConfig
          vacancyId={id!}
          isPublished={!!vacancy.talentum_project_id}
        />
      </div>

      {/* Talentum Publish Card */}
      <div className="mb-6">
        <VacancyTalentumCard
          vacancyId={id!}
          talentumProjectId={vacancy.talentum_project_id ?? null}
          talentumWhatsappUrl={vacancy.talentum_whatsapp_url ?? null}
          talentumSlug={vacancy.talentum_slug ?? null}
          talentumPublishedAt={vacancy.talentum_published_at ?? null}
          talentumDescription={vacancy.talentum_description ?? null}
          onRefresh={refetch}
        />
      </div>

      {/* Publicaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          {t('admin.vacancyDetail.publications.title')}
        </Typography>
        {publications.length === 0 ? (
          <Typography variant="body" className="text-[#737373]">
            {t('admin.vacancyDetail.publications.noPublications')}
          </Typography>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#EEEEEE] text-[#737373]">
                  <th className="text-left px-3 py-2 font-medium rounded-tl-lg">{t('admin.vacancyDetail.publications.channel')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('admin.vacancyDetail.publications.date')}</th>
                  <th className="text-left px-3 py-2 font-medium rounded-tr-lg">{t('admin.vacancyDetail.publications.recruiter')}</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((pub, i) => (
                  <tr key={i} className="border-b border-[#D9D9D9] last:border-0">
                    <td className="px-3 py-2">{pub.channel ?? '—'}</td>
                    <td className="px-3 py-2">
                      {pub.published_at
                        ? new Date(pub.published_at).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{pub.recruiter ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {vacancy && (
        <VacancyFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            refetch();
          }}
          vacancy={vacancy}
        />
      )}
    </div>
  );
}
