import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { type VacancyFormData, buildVacancyPayload, jsonbToSchedule } from '@presentation/components/features/admin/vacancy-form-schema';
import { GeminiParseStep } from '@presentation/components/features/admin/CreateVacancy/GeminiParseStep';
import { VacancyDataStep } from '@presentation/components/features/admin/CreateVacancy/VacancyDataStep';
import {
  PrescreeningStep,
  type PrescreeningQuestion,
  type FaqItem,
} from '@presentation/components/features/admin/CreateVacancy/PrescreeningStep';
import { ReviewStep } from '@presentation/components/features/admin/CreateVacancy/ReviewStep';

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

type StepNumber = 0 | 1 | 2 | 3;

interface StepperProps {
  currentStep: StepNumber;
  labels: [string, string, string, string];
}

function Stepper({ currentStep, labels }: StepperProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {labels.map((label, idx) => {
        const stepNum = idx as StepNumber;
        const isCompleted = currentStep > stepNum;
        const isActive = currentStep === stepNum;
        return (
          <div key={stepNum} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={[
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                isCompleted
                  ? 'bg-primary border-primary text-white'
                  : isActive
                    ? 'bg-white border-primary text-primary'
                    : 'bg-white border-slate-300 text-slate-400',
              ].join(' ')}>
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span className={[
                'text-xs font-medium whitespace-nowrap',
                isActive ? 'text-primary' : isCompleted ? 'text-slate-600' : 'text-slate-400',
              ].join(' ')}>
                {label}
              </span>
            </div>
            {idx < labels.length - 1 && (
              <div className={[
                'w-16 h-0.5 mx-2 mb-5 transition-colors',
                currentStep > stepNum ? 'bg-primary' : 'bg-slate-200',
              ].join(' ')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gemini result → form data mapper
// ---------------------------------------------------------------------------

function geminiToFormData(vacancy: Record<string, any>): VacancyFormData {
  const schedule = vacancy.schedule && Array.isArray(vacancy.schedule) && vacancy.schedule.length > 0
    ? jsonbToSchedule(vacancy.schedule)
    : [{ days: [], timeFrom: '', timeTo: '' }];

  return {
    title: vacancy.title || '',
    status: vacancy.status || 'BUSQUEDA',
    required_professions: vacancy.required_professions || [],
    required_sex: vacancy.required_sex || '',
    age_range_min: vacancy.age_range_min ?? undefined,
    age_range_max: vacancy.age_range_max ?? undefined,
    required_experience: vacancy.required_experience || '',
    worker_attributes: vacancy.worker_attributes || '',
    providers_needed: vacancy.providers_needed || 1,
    state: vacancy.state || '',
    city: vacancy.city || '',
    service_device_types: vacancy.service_device_types || [],
    work_schedule: vacancy.work_schedule || '',
    schedule,
    pathology_types: vacancy.pathology_types || '',
    dependency_level: vacancy.dependency_level || '',
    salary_text: vacancy.salary_text || '',
    payment_day: vacancy.payment_day || '',
    daily_obs: vacancy.daily_obs || '',
  };
}

function geminiToQuestions(questions: any[]): PrescreeningQuestion[] {
  return questions.map((q) => ({
    question: q.question || '',
    responseType: q.responseType || ['text', 'audio'],
    desiredResponse: q.desiredResponse || '',
    weight: q.weight || 5,
    required: q.required ?? false,
    analyzed: q.analyzed ?? true,
    earlyStoppage: q.earlyStoppage ?? false,
  }));
}

function geminiToFaq(faq: any[]): FaqItem[] {
  return faq.map((f) => ({
    question: f.question || '',
    answer: f.answer || '',
  }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateVacancyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cc = (k: string) => t(`admin.createVacancy.${k}`);

  const [step, setStep] = useState<StepNumber>(0);
  const [formData, setFormData] = useState<VacancyFormData | null>(null);
  const [vacancyNumber, setVacancyNumber] = useState<number | null>(null);
  const [caseNumber, setCaseNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PrescreeningQuestion[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [vacancyId, setVacancyId] = useState<string | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: fetch next vacancy number (auto-generated ID for this vacante)
  useEffect(() => {
    AdminApiService.getNextVacancyNumber()
      .then((n) => setVacancyNumber(n))
      .catch(() => setError(cc('errorLoadingCase')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 0 → Step 1: Gemini parsed, pre-fill form + prescreening
  const handleGeminiParsed = (result: {
    vacancy: Record<string, any>;
    prescreening: { questions: any[]; faq: any[] };
    description: { titulo_propuesta: string; descripcion_propuesta: string; perfil_profesional: string };
  }) => {
    // Use case_number from Gemini if available, then build title with both numbers
    const parsedCaseNumber = result.vacancy.case_number ?? caseNumber;
    if (parsedCaseNumber != null) setCaseNumber(parsedCaseNumber);
    const vacancyWithCase = {
      ...result.vacancy,
      case_number: parsedCaseNumber,
      title: parsedCaseNumber != null && vacancyNumber != null
        ? `CASO ${parsedCaseNumber}-${vacancyNumber}`
        : `CASO ${parsedCaseNumber ?? vacancyNumber}`,
    };
    setFormData(geminiToFormData(vacancyWithCase));
    setQuestions(geminiToQuestions(result.prescreening.questions));
    setFaq(geminiToFaq(result.prescreening.faq));

    // Build full description text for review
    const descText = [
      `Descripción de la Propuesta:\n${result.description.descripcion_propuesta}`,
      `Perfil Profesional Sugerido:\n${result.description.perfil_profesional}`,
      'El Marco de Acompañamiento:\nEnLite Health Solutions ofrece a los prestadores un marco de trabajo profesional y organizado, donde cada acompañamiento o cuidado se realiza dentro de un proyecto terapéutico claro, con supervisión clínica y soporte continuo del equipo de Coordinación Clínica formado por psicólogas. Nuestra propuesta de valor es brindarles casos acordes a su perfil y formación, con respaldo administrativo y clínico, para que puedan enfocarse en lo más importante: el bienestar del paciente.',
    ].join('\n\n');
    setGeneratedDescription(descText);

    setStep(1);
  };

  // Step 0: skip Gemini, go to manual flow
  const handleSkipGemini = () => setStep(1);

  // Step 1 → Step 2: store form data locally
  const handleStep1Next = (data: VacancyFormData) => {
    setFormData(data);
    setStep(2);
  };

  // Step 2 → Step 3: create/update vacancy + prescreening + generate description
  const handleStep2Next = async (prescreeningData: { questions: PrescreeningQuestion[]; faq: FaqItem[] }) => {
    if (!formData) return;

    setQuestions(prescreeningData.questions);
    setFaq(prescreeningData.faq);
    setIsProcessing(true);
    setError(null);

    try {
      let currentVacancyId = vacancyId;

      // 1. Create or update vacancy
      if (!currentVacancyId) {
        const result = await AdminApiService.createVacancy(buildVacancyPayload(formData, caseNumber));
        currentVacancyId = (result as any).id ?? result;
        setVacancyId(currentVacancyId);
      } else {
        await AdminApiService.updateVacancy(currentVacancyId, buildVacancyPayload(formData, caseNumber));
      }


      // 2. Save prescreening config
      await AdminApiService.savePrescreeningConfig(currentVacancyId!, {
        questions: prescreeningData.questions,
        faq: prescreeningData.faq,
      });

      // 3. Generate Talentum description (only if not already generated by Gemini)
      if (!generatedDescription) {
        const descResult = await AdminApiService.generateTalentumDescription(currentVacancyId!);
        setGeneratedDescription(descResult.description);
      }

      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: publish to Talentum
  const handlePublish = async () => {
    if (!vacancyId) return;
    setIsPublishing(true);
    setError(null);
    try {
      await AdminApiService.publishToTalentum(vacancyId);
      navigate(`/admin/vacancies/${vacancyId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsPublishing(false);
    }
  };

  const handleCancel = () => navigate('/admin/vacancies');
  const handleBackToStep0 = () => setStep(0);
  const handleBackToStep1 = () => setStep(1);
  const handleBackToStep2 = () => setStep(2);

  const stepLabels: [string, string, string, string] = [
    cc('step0Label'),
    cc('step1Label'),
    cc('step2Label'),
    cc('step3Label'),
  ];

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] py-8 px-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        {/* Page title */}
        <Typography variant="h2" weight="semibold" className="text-[#737373] font-poppins">
          {cc('pageTitle')}
        </Typography>

        {/* Stepper */}
        <Stepper currentStep={step} labels={stepLabels} />

        {/* Global error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <Typography variant="body" className="text-red-600 text-sm">{error}</Typography>
          </div>
        )}

        {/* Steps */}
        {step === 0 && (
          <GeminiParseStep
            onParsed={handleGeminiParsed}
            onSkip={handleSkipGemini}
            onCancel={handleCancel}
            isParsing={isParsing}
            setIsParsing={setIsParsing}
          />
        )}

        {step === 1 && (
          <VacancyDataStep
            initialData={formData}
            caseNumber={caseNumber}
            vacancyNumber={vacancyNumber}
            onCaseNumberChange={setCaseNumber}
            onNext={handleStep1Next}
            onCancel={handleBackToStep0}
          />
        )}

        {step === 2 && (
          <PrescreeningStep
            initialQuestions={questions}
            initialFaq={faq}
            onNext={handleStep2Next}
            onBack={handleBackToStep1}
            isProcessing={isProcessing}
          />
        )}

        {step === 3 && formData && (
          <ReviewStep
            formData={formData}
            caseNumber={caseNumber}
            vacancyNumber={vacancyNumber}
            questions={questions}
            faq={faq}
            generatedDescription={generatedDescription}
            isPublishing={isPublishing}
            onPublish={handlePublish}
            onBack={handleBackToStep2}
          />
        )}
      </div>
    </div>
  );
}
