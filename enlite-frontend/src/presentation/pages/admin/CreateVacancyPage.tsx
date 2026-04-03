import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { type VacancyFormData, buildVacancyPayload } from '@presentation/components/features/admin/vacancy-form-schema';
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

interface StepperProps {
  currentStep: 1 | 2 | 3;
  labels: [string, string, string];
}

function Stepper({ currentStep, labels }: StepperProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {labels.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3;
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
                {isCompleted ? '✓' : stepNum}
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
                'w-20 h-0.5 mx-2 mb-5 transition-colors',
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
// Page
// ---------------------------------------------------------------------------

export default function CreateVacancyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cc = (k: string) => t(`admin.createVacancy.${k}`);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<VacancyFormData | null>(null);
  const [caseNumber, setCaseNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PrescreeningQuestion[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [vacancyId, setVacancyId] = useState<string | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: fetch next case number
  useEffect(() => {
    AdminApiService.getNextCaseNumber()
      .then((n) => setCaseNumber(n))
      .catch(() => setError(cc('errorLoadingCase')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // 3. Generate Talentum description
      const descResult = await AdminApiService.generateTalentumDescription(currentVacancyId!);
      setGeneratedDescription(descResult.description);

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
  const handleBackToStep1 = () => setStep(1);
  const handleBackToStep2 = () => setStep(2);

  const stepLabels: [string, string, string] = [
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
        {step === 1 && (
          <VacancyDataStep
            initialData={formData}
            caseNumber={caseNumber}
            onNext={handleStep1Next}
            onCancel={handleCancel}
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
