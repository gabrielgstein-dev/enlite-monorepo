import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';
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

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vacancy, isLoading, error, refetch } = useVacancyDetail(id);
  const [isEnriching, setIsEnriching] = useState(false);

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
          {error ?? 'Vaga não encontrada'}
        </Typography>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/vacancies')}>
          ← Voltar
        </Button>
      </div>
    );
  }

  const patientName = [vacancy.patient_first_name, vacancy.patient_last_name]
    .filter(Boolean)
    .join(' ');
  const pageTitle = vacancy.case_number
    ? `Caso ${vacancy.case_number}${patientName ? ` — ${patientName}` : ''}`
    : vacancy.title ?? 'Vaga';

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
              Voltar
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
            title="Re-enricher campos LLM"
            className="p-2 rounded-full border border-[#D9D9D9] hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
          >
            <Sparkles className={`w-4 h-4 ${isEnriching ? 'animate-pulse' : ''}`} />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/vacancies/${id}/kanban`)}
            className="flex items-center gap-2 px-5"
          >
            Kanban
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/admin/vacancies/${id}/match`)}
            className="flex items-center gap-2 px-5"
          >
            Ver Match →
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

      {/* Encuadres */}
      <div className="mb-6">
        <VacancyEncuadresCard encuadres={vacancy.encuadres ?? []} onRefresh={refetch} />
      </div>

      {/* Publicações */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          Publicações
        </Typography>
        {publications.length === 0 ? (
          <Typography variant="body" className="text-[#737373]">
            Nenhuma publicação registrada.
          </Typography>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#EEEEEE] text-[#737373]">
                  <th className="text-left px-3 py-2 font-medium rounded-tl-lg">Canal</th>
                  <th className="text-left px-3 py-2 font-medium">Data</th>
                  <th className="text-left px-3 py-2 font-medium rounded-tr-lg">Recrutador</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((pub, i) => (
                  <tr key={i} className="border-b border-[#D9D9D9] last:border-0">
                    <td className="px-3 py-2">{pub.channel ?? '—'}</td>
                    <td className="px-3 py-2">
                      {pub.published_at
                        ? new Date(pub.published_at).toLocaleDateString('pt-BR')
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
    </div>
  );
}
