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
import { PatientAddressSelector } from '@presentation/components/features/admin/CreateVacancy/PatientAddressSelector';
import { PatientFieldClashResolver } from '@presentation/components/features/admin/CreateVacancy/PatientFieldClashResolver';
import { useCreateVacancyFlow } from '@hooks/admin/useCreateVacancyFlow';

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

type StepNumber = 0 | 1 | 2 | 3 | 4 | 5;

interface StepperProps {
  currentStep: StepNumber;
  labels: [string, string, string, string, string, string];
}

function Stepper({ currentStep, labels }: StepperProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 overflow-x-auto pb-2">
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
                'w-12 h-0.5 mx-1 mb-5 transition-colors',
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
    work_schedule: vacancy.work_schedule || '',
    schedule,
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

  const flow = useCreateVacancyFlow();

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

  useEffect(() => {
    AdminApiService.getNextVacancyNumber()
      .then((n) => setVacancyNumber(n))
      .catch(() => setError(cc('errorLoadingCase')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 0 → step 1/3: GeminiParseStep resolved
  const handleGeminiParsed = (result: {
    parsed: Record<string, any>;
    addressMatches: any[];
    fieldClashes: any[];
    patientId: string | null;
  }) => {
    const vacancyData = result.parsed.vacancy ?? result.parsed;
    const prescreeningData = result.parsed.prescreening ?? { questions: [], faq: [] };
    const descriptionData = result.parsed.description ?? { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' };

    const parsedCaseNumber = vacancyData.case_number ?? caseNumber;
    if (parsedCaseNumber != null) setCaseNumber(parsedCaseNumber);
    const vacancyWithCase = {
      ...vacancyData,
      case_number: parsedCaseNumber,
      title: parsedCaseNumber != null && vacancyNumber != null
        ? `CASO ${parsedCaseNumber}-${vacancyNumber}`
        : `CASO ${parsedCaseNumber ?? vacancyNumber}`,
    };
    setFormData(geminiToFormData(vacancyWithCase));
    setQuestions(geminiToQuestions(prescreeningData.questions));
    setFaq(geminiToFaq(prescreeningData.faq));

    const descText = [
      `Descripción de la Propuesta:\n${descriptionData.descripcion_propuesta}`,
      `Perfil Profesional Sugerido:\n${descriptionData.perfil_profesional}`,
      'El Marco de Acompañamiento:\nEnLite Health Solutions ofrece a los prestadores un marco de trabajo profesional y organizado, donde cada acompañamiento o cuidado se realiza dentro de un proyecto terapéutico claro, con supervisión clínica y soporte continuo del equipo de Coordinación Clínica formado por psicólogas.',
    ].join('\n\n');
    setGeneratedDescription(descText);

    flow.advanceFromStep0({
      parsed: result.parsed as any,
      addressMatches: result.addressMatches,
      fieldClashes: result.fieldClashes,
      patientId: result.patientId,
    });
  };

  // Step 0 → Step 3: skip Gemini
  const handleSkipGemini = () => flow.skipToStep3();

  // Step 3 → Step 4: store form data
  const handleStep3Next = (data: VacancyFormData) => {
    setFormData(data);
    flow.setStep4();
  };

  // Step 4 → Step 5: create vacancy + prescreening + generate description
  const handleStep4Next = async (prescreeningData: { questions: PrescreeningQuestion[]; faq: FaqItem[] }) => {
    if (!formData) return;
    setQuestions(prescreeningData.questions);
    setFaq(prescreeningData.faq);
    setIsProcessing(true);
    setError(null);

    try {
      let currentVacancyId = vacancyId;
      const updatePatient = flow.buildUpdatePatientPayload();
      const payload = {
        ...buildVacancyPayload(formData, caseNumber),
        ...(flow.selectedAddressId ? { patient_address_id: flow.selectedAddressId } : {}),
        ...(Object.keys(updatePatient).length > 0 ? { updatePatient } : {}),
      };

      if (!currentVacancyId) {
        const result = await AdminApiService.createVacancy(payload);
        currentVacancyId = (result as any).id ?? result;
        setVacancyId(currentVacancyId);
      } else {
        await AdminApiService.updateVacancy(currentVacancyId, payload);
      }

      await AdminApiService.savePrescreeningConfig(currentVacancyId!, {
        questions: prescreeningData.questions,
        faq: prescreeningData.faq,
      });

      if (!generatedDescription) {
        const descResult = await AdminApiService.generateTalentumDescription(currentVacancyId!);
        setGeneratedDescription(descResult.description);
      }

      flow.setStep5();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

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

  const stepLabels: [string, string, string, string, string, string] = [
    cc('step0Label'),
    cc('step1Label'),
    cc('step2Label'),
    cc('step3Label'),
    cc('step4Label'),
    cc('step5Label'),
  ];

  const currentStep = flow.step as StepNumber;

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] py-8 px-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        <Typography variant="h2" weight="semibold" className="text-[#737373] font-poppins">
          {cc('pageTitle')}
        </Typography>

        <Stepper currentStep={currentStep} labels={stepLabels} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <Typography variant="body" className="text-red-600 text-sm">{error}</Typography>
          </div>
        )}

        {currentStep === 0 && (
          <GeminiParseStep
            onParsed={handleGeminiParsed}
            onSkip={handleSkipGemini}
            onCancel={handleCancel}
            isParsing={isParsing}
            setIsParsing={setIsParsing}
          />
        )}

        {currentStep === 1 && (
          <PatientAddressSelector
            patientId={flow.patientId}
            addressMatches={flow.addressMatches}
            selectedAddressId={flow.selectedAddressId}
            onSelect={flow.selectAddress}
            onCreateNew={flow.createPatientAddress}
            onNext={flow.advanceFromStep1}
            onBack={flow.goBack}
            isCreating={flow.isCreatingAddress}
          />
        )}

        {currentStep === 2 && (
          <PatientFieldClashResolver
            clashes={flow.fieldClashes}
            resolvedClashes={flow.resolvedClashes}
            onResolve={flow.resolveClash}
            onNext={flow.advanceFromStep2}
            onBack={flow.goBack}
          />
        )}

        {currentStep === 3 && (
          <VacancyDataStep
            initialData={formData}
            caseNumber={caseNumber}
            vacancyNumber={vacancyNumber}
            onCaseNumberChange={setCaseNumber}
            onNext={handleStep3Next}
            onCancel={flow.goBack}
          />
        )}

        {currentStep === 4 && (
          <PrescreeningStep
            initialQuestions={questions}
            initialFaq={faq}
            onNext={handleStep4Next}
            onBack={flow.goBack}
            isProcessing={isProcessing}
          />
        )}

        {currentStep === 5 && formData && (
          <ReviewStep
            formData={formData}
            caseNumber={caseNumber}
            vacancyNumber={vacancyNumber}
            questions={questions}
            faq={faq}
            generatedDescription={generatedDescription}
            isPublishing={isPublishing}
            onPublish={handlePublish}
            onBack={flow.goBack}
          />
        )}
      </div>
    </div>
  );
}
