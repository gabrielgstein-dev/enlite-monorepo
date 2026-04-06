import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, CheckCircle2, Briefcase } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';
import { PublicApiService, VacancyNotFoundError } from '@infrastructure/http/PublicApiService';
import { usePostularseAction } from '@presentation/hooks/usePostularseAction';
import { ScheduleSection } from './components/ScheduleSection';
import { UnauthenticatedModal } from './components/UnauthenticatedModal';
import { IncompleteRegistrationModal } from './components/IncompleteRegistrationModal';
import type { PublicVacancyDetail } from '@domain/entities/Vacancy';

// ── Sub-components ──────────────────────────────────────────────────────────

function VacancyCaseCard({
  vacancy,
  onPostularse,
  isLoading,
}: {
  vacancy: PublicVacancyDetail;
  onPostularse: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const statusLabel =
    vacancy.status === 'BUSQUEDA' ? t('publicVacancy.statusActive') : vacancy.status;

  return (
    <div className="bg-white border-[2.5px] border-[#eceff1] rounded-card overflow-hidden w-full lg:w-96 shrink-0">
      {/* Imagem placeholder — 240px como no Figma */}
      <div className="h-60 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
        <Briefcase className="w-16 h-16 text-primary/20" />
      </div>

      <div className="px-8 py-6 flex flex-col gap-5">
        {/* Título + Status badge */}
        <div className="flex items-center justify-between w-full">
          <p className="font-poppins font-semibold text-2xl leading-[1.3] text-[#737373]">
            {vacancy.case_number != null
              ? `CASO ${vacancy.case_number}-${vacancy.vacancy_number}`
              : `CASO ${vacancy.vacancy_number}`}
          </p>
          <span className="bg-blue-yonder text-white text-sm font-poppins font-medium px-6 py-1 rounded">
            {statusLabel}
          </span>
        </div>

        {/* Grau de Dependência tag */}
        {vacancy.dependency_level && (
          <div className="bg-[#eceff1] inline-flex items-center justify-center self-start px-7 py-2 rounded">
            <span className="text-cyan-focus font-lexend font-medium text-base leading-[1.35]">
              {vacancy.dependency_level}
            </span>
          </div>
        )}

        {/* Descrição curta (título da vaga) */}
        <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
          {vacancy.title}
        </p>

        {/* Endereço */}
        {vacancy.patient_zone && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#737373] shrink-0" />
            <span className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
              {vacancy.patient_zone}
            </span>
          </div>
        )}

        {/* Botão Postularse */}
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={onPostularse}
          isLoading={isLoading}
          disabled={!vacancy.talentum_whatsapp_url}
        >
          {t('publicVacancy.postularse')}
        </Button>
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
    <div className="bg-white border-[2.5px] border-[#eceff1] rounded-card overflow-hidden flex-1 px-8 py-8">
      <div className="flex flex-col gap-6">
        {/* Header: título + botão */}
        <div className="flex items-center justify-between">
          <p className="font-poppins font-semibold text-2xl leading-[1.3] text-primary">
            {t('publicVacancy.therapeuticCompanions')}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onPostularse}
            isLoading={isLoading}
            disabled={!vacancy.talentum_whatsapp_url}
          >
            {t('publicVacancy.postularse')}
          </Button>
        </div>

        {/* Indicações: disponível para + hipótese diagnóstica */}
        <div className="flex flex-col gap-3">
          {vacancy.required_sex && (
            <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
              {t('publicVacancy.availableFor')}{' '}
              <span className="text-primary font-medium">
                {t(`publicVacancy.sexLabels.${vacancy.required_sex}`, vacancy.required_sex)}
              </span>
            </p>
          )}
          {vacancy.pathology_types && (
            <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
              {t('publicVacancy.diagnosticHypothesis')}{' '}
              <span className="text-primary font-medium">{vacancy.pathology_types}</span>
            </p>
          )}
        </div>

        {/* Descrição do trabalho */}
        {vacancy.talentum_description && (
          <div className="flex flex-col gap-2">
            <p className="font-lexend font-medium text-base leading-[1.35] text-primary">
              {t('publicVacancy.jobDescription')}
            </p>
            <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373] whitespace-pre-line">
              {vacancy.talentum_description}
            </p>
          </div>
        )}

        {/* Características */}
        <div className="flex flex-col gap-2">
          <p className="font-lexend font-medium text-base leading-[1.35] text-primary">
            {t('publicVacancy.characteristics')}
          </p>
          <div className="flex flex-col gap-2.5">
            {(vacancy.age_range_min != null || vacancy.age_range_max != null) && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
                  {t('publicVacancy.ageRange')}{' '}
                  <span className="text-primary">
                    {vacancy.age_range_min != null && vacancy.age_range_max != null
                      ? `${vacancy.age_range_min} - ${vacancy.age_range_max}`
                      : vacancy.age_range_min ?? vacancy.age_range_max}
                  </span>
                </p>
              </div>
            )}
            {vacancy.patient_zone && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
                  {t('publicVacancy.location')}{' '}
                  <span className="text-primary">{vacancy.patient_zone}</span>
                </p>
              </div>
            )}
            {vacancy.worker_attributes && (
              <div className="flex items-start gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-1" />
                <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
                  {t('publicVacancy.profile')}{' '}
                  <span className="text-primary">{vacancy.worker_attributes}</span>
                </p>
              </div>
            )}
            {vacancy.service_device_types.length > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
                  {t('publicVacancy.serviceType')}{' '}
                  <span className="text-primary">
                    {vacancy.service_device_types.join(', ')}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Horários */}
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
      <div className="bg-gray-300 rounded-card w-full lg:w-96 h-[573px]" />
      <div className="bg-gray-300 rounded-card flex-1 h-[764px]" />
    </div>
  );
}

function VacancyNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="font-poppins font-semibold text-2xl text-primary mb-4">
        {t('publicVacancy.notFound.title')}
      </p>
      <p className="font-lexend text-sm text-[#737373] mb-6">
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

  const { state, missingFields, postularse, dismissModal, confirmRegister } = usePostularseAction(
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
    <div className="min-h-screen bg-background">
      {/* Navbar — Poppins SemiBold 24px como no Figma */}
      <header className="flex items-center justify-between px-6 lg:px-[120px] py-8">
        <p className="font-poppins font-semibold text-2xl leading-[1.3] text-primary">
          {vacancy
            ? `${t('publicVacancy.vacante')}: ${vacancy.title}`
            : t('publicVacancy.vacante')}
        </p>
        {vacancy?.country && (
          <div className="hidden md:inline-flex items-center gap-2 shrink-0">
            <img
              className="w-7 h-5 object-cover"
              alt={t(`countries.${vacancy.country}`)}
              src={`https://flagcdn.com/w40/${vacancy.country.toLowerCase()}.png`}
            />
            <span className="font-lexend font-medium text-sm text-[#737373] whitespace-nowrap">
              {t(`countries.${vacancy.country}`)}
            </span>
          </div>
        )}
      </header>

      {/* Content — posicionado como no Figma: left-[120px] com w-[1200px] */}
      <main className="px-6 lg:px-[120px] pb-12">
        {isLoading && <VacancySkeleton />}
        {isNotFound && <VacancyNotFound />}
        {vacancy && !isLoading && (
          <div className="flex flex-col lg:flex-row items-start gap-6 max-w-[1200px]">
            <VacancyCaseCard
              vacancy={vacancy}
              onPostularse={postularse}
              isLoading={state === 'loading'}
            />
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

      {state === 'incomplete' && missingFields && (
        <IncompleteRegistrationModal missingFields={missingFields} onClose={dismissModal} />
      )}
    </div>
  );
}
