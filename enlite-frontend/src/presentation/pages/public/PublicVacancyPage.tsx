import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, CheckCircle2, Briefcase } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';
import { Typography } from '@presentation/components/atoms/Typography';
import { PublicApiService, VacancyNotFoundError } from '@infrastructure/http/PublicApiService';
import { usePostularseAction } from '@presentation/hooks/usePostularseAction';
import { ScheduleSection } from './components/ScheduleSection';
import { UnauthenticatedModal } from './components/UnauthenticatedModal';
import type { PublicVacancyDetail } from '@domain/entities/Vacancy';

// ── Sub-components ──────────────────────────────────────────────────────────

function VacancyCaseCard({ vacancy }: { vacancy: PublicVacancyDetail }) {
  const { t } = useTranslation();
  const statusLabel =
    vacancy.status === 'BUSQUEDA' ? t('publicVacancy.statusActive') : vacancy.status;

  return (
    <div className="bg-white border-2 border-[#eceff1] rounded-2xl overflow-hidden w-full lg:w-[404px] shrink-0">
      <div className="h-[248px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
        <Briefcase className="w-16 h-16 text-primary/30" />
      </div>

      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <Typography variant="h2" weight="semibold" className="text-gray-500">
            CASO {vacancy.case_number}
          </Typography>
          <span className="bg-[#5a73a3] text-white text-sm font-poppins font-medium px-6 py-1 rounded">
            {statusLabel}
          </span>
        </div>

        {vacancy.dependency_level && (
          <div className="bg-[#eceff1] inline-flex items-center justify-center px-7 py-2 rounded">
            <span className="text-[#06addd] font-lexend font-medium text-base">
              {vacancy.dependency_level}
            </span>
          </div>
        )}

        <p className="font-lexend font-medium text-sm text-gray-500 leading-snug">
          {vacancy.title}
        </p>

        {vacancy.patient_zone && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="font-lexend font-medium text-sm text-gray-500">
              {vacancy.patient_zone}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function VacancyDetailsCard({
  vacancy,
  onPostularse,
  isLoading,
}: {
  vacancy: PublicVacancyDetail;
  onPostularse: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white border-2 border-[#eceff1] rounded-2xl overflow-hidden flex-1 p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Typography variant="h1" weight="semibold" color="primary">
            {t('publicVacancy.therapeuticCompanions')}
          </Typography>
          <Button
            variant="primary"
            size="md"
            onClick={onPostularse}
            isLoading={isLoading}
            disabled={!vacancy.talentum_whatsapp_url}
          >
            {t('publicVacancy.postularse')}
          </Button>
        </div>

        <div className="space-y-3 font-lexend font-medium text-sm">
          {vacancy.required_sex && (
            <p className="text-gray-500">
              {t('publicVacancy.availableFor')}{' '}
              <span className="text-primary">{vacancy.required_sex}</span>
            </p>
          )}
          {vacancy.pathology_types && (
            <p className="text-gray-500">
              {t('publicVacancy.diagnosticHypothesis')}{' '}
              <span className="text-primary">{vacancy.pathology_types}</span>
            </p>
          )}
        </div>

        {vacancy.talentum_description && (
          <div className="space-y-2">
            <Typography variant="label" weight="medium" color="primary">
              {t('publicVacancy.jobDescription')}
            </Typography>
            <p className="font-lexend font-medium text-sm text-gray-500 leading-snug whitespace-pre-line">
              {vacancy.talentum_description}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Typography variant="label" weight="medium" color="primary">
            {t('publicVacancy.characteristics')}
          </Typography>
          <div className="space-y-2.5">
            {(vacancy.age_range_min != null || vacancy.age_range_max != null) && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="font-lexend font-medium text-sm text-gray-500">
                  {t('publicVacancy.ageRange')}{' '}
                  <span className="text-primary">
                    {vacancy.age_range_min != null && vacancy.age_range_max != null
                      ? `${vacancy.age_range_min} - ${vacancy.age_range_max}`
                      : vacancy.age_range_min ?? vacancy.age_range_max}
                  </span>
                </span>
              </div>
            )}
            {vacancy.patient_zone && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="font-lexend font-medium text-sm text-gray-500">
                  {t('publicVacancy.location')}{' '}
                  <span className="text-primary">{vacancy.patient_zone}</span>
                </span>
              </div>
            )}
            {vacancy.worker_attributes && (
              <div className="flex items-start gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="font-lexend font-medium text-sm text-gray-500">
                  {t('publicVacancy.profile')}{' '}
                  <span className="text-primary">{vacancy.worker_attributes}</span>
                </span>
              </div>
            )}
            {vacancy.service_device_types.length > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="font-lexend font-medium text-sm text-gray-500">
                  {t('publicVacancy.serviceType')}{' '}
                  <span className="text-primary">
                    {vacancy.service_device_types.join(', ')}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {vacancy.schedule && Object.keys(vacancy.schedule).length > 0 && (
          <ScheduleSection schedule={vacancy.schedule} />
        )}
      </div>
    </div>
  );
}

function VacancySkeleton() {
  return (
    <div className="animate-pulse flex flex-col lg:flex-row gap-6">
      <div className="bg-gray-200 rounded-2xl w-full lg:w-[404px] h-[573px]" />
      <div className="bg-gray-200 rounded-2xl flex-1 h-[764px]" />
    </div>
  );
}

function VacancyNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Typography variant="h2" weight="semibold" color="primary" className="mb-4">
        {t('publicVacancy.notFound.title')}
      </Typography>
      <p className="font-lexend text-sm text-gray-500 mb-6">
        {t('publicVacancy.notFound.body')}
      </p>
      <Link to="/" className="text-primary underline font-lexend text-sm">
        {t('publicVacancy.notFound.backHome')}
      </Link>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicVacancyPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [vacancy, setVacancy] = useState<PublicVacancyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);

  const { state, postularse, dismissModal, confirmRegister } = usePostularseAction(
    vacancy?.talentum_whatsapp_url ?? null,
  );

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    PublicApiService.getVacancy(id)
      .then(setVacancy)
      .catch((err) => {
        if (err instanceof VacancyNotFoundError) setIsNotFound(true);
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-[#fff9fc]">
      <header className="flex items-center justify-between px-6 lg:px-20 py-6">
        <Typography variant="h1" weight="semibold" color="primary">
          {vacancy
            ? `${t('publicVacancy.vacante')}: ${vacancy.title}`
            : t('publicVacancy.vacante')}
        </Typography>
      </header>

      <main className="px-6 lg:px-20 pb-12">
        {isLoading && <VacancySkeleton />}
        {isNotFound && <VacancyNotFound />}
        {vacancy && !isLoading && (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <VacancyCaseCard vacancy={vacancy} />
            <VacancyDetailsCard
              vacancy={vacancy}
              onPostularse={postularse}
              isLoading={state === 'loading'}
            />
          </div>
        )}
      </main>

      {state === 'unauthenticated' && (
        <UnauthenticatedModal onClose={dismissModal} onConfirm={confirmRegister} />
      )}
    </div>
  );
}
