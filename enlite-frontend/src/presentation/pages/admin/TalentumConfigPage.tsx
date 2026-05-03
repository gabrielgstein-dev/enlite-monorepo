/**
 * TalentumConfigPage
 *
 * Tela 2 do fluxo de criação de vaga:
 *   - Revisar conteúdo gerado pela IA
 *   - Configurar prescreening
 *   - Publicar no Talentum
 *
 * Rota: /admin/vacancies/:id/talentum
 */

import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { useTalentumConfig } from '@hooks/admin/useTalentumConfig';
import { Stepper } from '@presentation/components/molecules/Stepper';
import { VacancySummaryCard } from '@presentation/components/features/admin/TalentumConfig/VacancySummaryCard';
import { AIDescriptionEditor } from '@presentation/components/features/admin/TalentumConfig/AIDescriptionEditor';
import { PrescreeningStep } from '@presentation/components/features/admin/TalentumConfig/PrescreeningStep';
import { VacancySocialLinksCard } from '@presentation/components/features/admin/VacancyDetail/VacancySocialLinksCard';

export default function TalentumConfigPage(): JSX.Element {
  const { id: vacancyId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const tc = (k: string) => t(`admin.talentumConfig.${k}`);
  const v = (k: string) => t(`admin.createVacancyV2.${k}`);

  // Step 1 navigates here with pre-generated AI content in location.state to skip
  // an extra generate call. Keep memoized so the hook only seeds once.
  const preloaded = useMemo(() => {
    const s = (location.state ?? {}) as Record<string, unknown>;
    if (!s || typeof s !== 'object') return undefined;
    return {
      description: typeof s.description === 'string' ? s.description : undefined,
      prescreeningQuestions: Array.isArray(s.prescreeningQuestions)
        ? (s.prescreeningQuestions as any)
        : undefined,
      prescreeningFaq: Array.isArray(s.prescreeningFaq)
        ? (s.prescreeningFaq as any)
        : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    vacancyData,
    isLoadingVacancy,
    vacancyError,
    description,
    prescreeningQuestions,
    prescreeningFaq,
    generateStatus,
    generateError,
    isPublishing,
    publishError,
    setDescription,
    generateAIContent,
    savePrescreening,
    publish,
  } = useTalentumConfig(vacancyId, preloaded);

  // Auto-generate AI content on mount when there's nothing yet (handles direct
  // navigation/refresh on Step 2 — Step 1 normally pre-loads via location.state).
  const hasGeneratedContent = description.trim().length > 0;
  useEffect(() => {
    if (!isLoadingVacancy && !vacancyError && !hasGeneratedContent && generateStatus === 'idle') {
      generateAIContent();
    }
  }, [isLoadingVacancy, vacancyError, hasGeneratedContent, generateStatus, generateAIContent]);

  const handlePrescreeningNext = async (data: {
    questions: typeof prescreeningQuestions;
    faq: typeof prescreeningFaq;
  }) => {
    await savePrescreening(data);
  };

  const handlePublish = async () => {
    try {
      await publish();
      navigate(`/admin/vacancies/${vacancyId}`);
    } catch {
      // publishError is stored in hook state
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoadingVacancy) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#180149]" />
      </div>
    );
  }

  // ── Vacancy fetch error ────────────────────────────────────────────────────
  if (vacancyError) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex items-center justify-center px-6">
        <div className="bg-red-50 border border-red-200 rounded-[10px] px-6 py-4 max-w-md text-center">
          <Typography variant="body" className="text-red-600 font-['Lexend']">
            {vacancyError}
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] py-10 px-6">
      <div className="max-w-[1296px] mx-auto flex flex-col gap-6">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-['Poppins'] font-semibold text-[32px] leading-[1.3] text-[#180149]">
              {tc('pageTitle')}
            </h1>
            <p className="font-['Lexend'] font-medium text-[16px] text-[#737373]">
              {tc('pageSubtitle')}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {publishError && (
              <p className="text-sm text-red-600 font-['Lexend'] text-right max-w-[260px]">
                {publishError}
              </p>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing}
              className="h-10 w-[200px] rounded-full bg-[#180149] text-white font-['Poppins'] font-semibold text-[16px] hover:bg-[#180149]/90 active:bg-[#180149]/80 flex items-center justify-center gap-2"
            >
              {isPublishing && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPublishing ? tc('publishing') : tc('publishButton')}
            </Button>
          </div>
        </div>

        {/* ── Stepper ─────────────────────────────────────────────────────── */}
        <Stepper
          currentStep={2}
          steps={[
            { label: v('steps.vacancyData') },
            { label: v('steps.talentumConfig') },
            { label: v('steps.vacancyDetail') },
          ]}
        />

        {/* ── Section 1: Vacancy summary ──────────────────────────────────── */}
        {vacancyData && <VacancySummaryCard data={vacancyData} />}

        {/* ── Section 2: AI-generated content ─────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <h2 className="font-['Poppins'] font-semibold text-[24px] text-[#180149] border-b border-[#d9d9d9] pb-2">
            {tc('aiSectionTitle')}
          </h2>

          {/* Generation status banner — replaces the manual "Generate" button */}
          {generateStatus === 'loading' && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <p className="text-sm text-blue-700 font-['Lexend']">{tc('generatingAI')}</p>
            </div>
          )}
          {generateStatus === 'error' && generateError && (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-600 font-['Lexend']">{generateError}</p>
              <Button variant="outline" size="sm" onClick={generateAIContent}>
                {tc('retryGenerate')}
              </Button>
            </div>
          )}

          <AIDescriptionEditor value={description} onChange={setDescription} />

          {/* Prescreening */}
          <h3 className="font-['Poppins'] font-semibold text-[20px] text-[#180149]">
            {tc('prescreeningSectionTitle')}
          </h3>

          <PrescreeningStep
            initialQuestions={prescreeningQuestions}
            initialFaq={prescreeningFaq}
            onNext={handlePrescreeningNext}
            onBack={() => navigate(`/admin/vacancies/new`)}
            isProcessing={false}
          />
        </div>

        {/* ── Section 3: Social links ──────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <h2 className="font-['Poppins'] font-semibold text-[24px] text-[#180149] border-b border-[#d9d9d9] pb-2">
            {tc('socialSectionTitle')}
          </h2>

          <VacancySocialLinksCard
            vacancyId={vacancyId}
            caseNumber={vacancyData?.caseNumber ?? null}
            vacancyNumber={vacancyData?.vacancyNumber ?? null}
            socialShortLinks={null}
            onRefresh={() => {}}
          />
        </div>

      </div>
    </div>
  );
}
