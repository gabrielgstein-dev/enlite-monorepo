import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { VacancyFormData } from '../vacancy-form-schema';
import {
  PROFESSION_OPTIONS, DEVICE_OPTIONS, WORK_SCHEDULE_OPTIONS, STATUS_OPTIONS,
  DEPENDENCY_OPTIONS,
} from '../vacancy-form-schema';
import { DAY_LABELS, type DayKey } from '../vacancyScheduleUtils';
import type { PrescreeningQuestion, FaqItem } from './PrescreeningStep';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatScheduleForReview(
  schedule: Array<{ days: string[]; timeFrom: string; timeTo: string }>,
): string {
  return schedule
    .filter((e) => e.days.length > 0 && e.timeFrom && e.timeTo)
    .map((e) => {
      const dayNames = e.days.map((k) => DAY_LABELS[k as DayKey] ?? k).join(', ');
      return `${dayNames} ${e.timeFrom}-${e.timeTo}`;
    })
    .join(' | ');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  formData: VacancyFormData;
  caseNumber: number | null;
  vacancyNumber: number | null;
  questions: PrescreeningQuestion[];
  faq: FaqItem[];
  generatedDescription: string | null;
  isPublishing: boolean;
  onPublish: () => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373] font-poppins">
        {title}
      </Typography>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="border-t border-slate-100 pt-3 mt-1">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReviewStep({
  formData, caseNumber, vacancyNumber, questions, faq, generatedDescription, isPublishing, onPublish, onBack,
}: ReviewStepProps) {
  const { t } = useTranslation();
  const tp = (k: string) => t(`admin.vacancyDetail.vacancyForm.${k}`);
  const tr = (k: string) => t(`admin.createVacancy.review.${k}`);
  const cc = (k: string) => t(`admin.createVacancy.${k}`);

  // Format array fields to comma-separated labels
  const professionLabels = (PROFESSION_OPTIONS as readonly string[])
    .filter((o) => formData.required_professions.includes(o))
    .map((o) => tp(`professionOptions.${o}`))
    .join(', ');

  const deviceLabels = (DEVICE_OPTIONS as readonly string[])
    .filter((o) => formData.service_device_types.includes(o))
    .map((o) => tp(`deviceOptions.${o}`))
    .join(', ');

  const workScheduleLabel = formData.work_schedule
    ? (WORK_SCHEDULE_OPTIONS as readonly string[]).includes(formData.work_schedule)
      ? tp(`workScheduleOptions.${formData.work_schedule}`)
      : formData.work_schedule
    : '';

  const statusLabel = formData.status
    ? (STATUS_OPTIONS as readonly string[]).includes(formData.status)
      ? tp(`statusOptions.${formData.status}`)
      : formData.status
    : '';

  const dependencyLabel = formData.dependency_level
    ? (DEPENDENCY_OPTIONS as readonly string[]).includes(formData.dependency_level)
      ? tp(`dependencyOptions.${formData.dependency_level}`)
      : formData.dependency_level
    : '';

  const scheduleText = formatScheduleForReview(formData.schedule);

  return (
    <div className="flex flex-col gap-6">

      {/* Card 1: Datos de la Vacante */}
      <Card title={tr('vacancyData')}>
        <SectionDivider label={tp('sectionCaseInfo')} />
        <div className="grid grid-cols-2 gap-4">
          {caseNumber != null && (
            <DataRow label={tp('caseNumber')} value={String(caseNumber)} />
          )}
          {vacancyNumber != null && (
            <DataRow label={tp('vacancyNumber')} value={String(vacancyNumber)} />
          )}
          <DataRow label={tp('title')} value={formData.title} />
          <DataRow label={tp('status')} value={statusLabel} />
        </div>

        <SectionDivider label={tp('sectionProfessionalProfile')} />
        <div className="grid grid-cols-2 gap-4">
          <DataRow label={tp('requiredProfessions')} value={professionLabels} />
          <DataRow label={tp('requiredSex')}
            value={formData.required_sex ? tp(`sexOptions.${formData.required_sex}`) : ''} />
          <DataRow label={tp('providersNeeded')} value={String(formData.providers_needed)} />
          {formData.age_range_min != null && (
            <DataRow label={tp('ageRangeMin')} value={String(formData.age_range_min)} />
          )}
          {formData.age_range_max != null && (
            <DataRow label={tp('ageRangeMax')} value={String(formData.age_range_max)} />
          )}
        </div>
        {formData.required_experience && (
          <DataRow label={tp('requiredExperience')} value={formData.required_experience} />
        )}
        {formData.worker_attributes && (
          <DataRow label={tp('workerAttributes')} value={formData.worker_attributes} />
        )}

        <SectionDivider label={tp('sectionLocationSchedule')} />
        <div className="grid grid-cols-2 gap-4">
          <DataRow label={tp('state')} value={formData.state} />
          <DataRow label={tp('city')} value={formData.city} />
          <DataRow label={tp('serviceDeviceTypes')} value={deviceLabels} />
          <DataRow label={tp('workSchedule')} value={workScheduleLabel} />
        </div>
        {scheduleText && (
          <DataRow label={tp('schedule')} value={scheduleText} />
        )}

        <SectionDivider label={tp('sectionClinicalInfo')} />
        <div className="grid grid-cols-2 gap-4">
          {formData.pathology_types && (
            <DataRow label={tp('pathologyTypes')} value={formData.pathology_types} />
          )}
          {dependencyLabel && (
            <DataRow label={tp('dependencyLevel')} value={dependencyLabel} />
          )}
        </div>

        <SectionDivider label={tp('sectionConditions')} />
        <div className="grid grid-cols-2 gap-4">
          {formData.salary_text && (
            <DataRow label={tp('salaryText')} value={formData.salary_text} />
          )}
          {formData.payment_day && (
            <DataRow label={tp('paymentDay')} value={formData.payment_day} />
          )}
        </div>

        {formData.daily_obs && (
          <DataRow label={tp('observations')} value={formData.daily_obs} />
        )}
      </Card>

      {/* Card 2: Preguntas de Pre-Screening */}
      <Card title={tr('prescreeningTitle')}>
        {questions.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('admin.vacancyDetail.prescreening.noQuestions')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {questions.map((q, i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-4 flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('admin.vacancyDetail.prescreening.questionLabel', { n: i + 1 })}
                </span>
                <p className="text-sm text-slate-700">{q.question}</p>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-400">{tr('desiredResponse')}</span>
                    <span className="text-sm text-slate-600">{q.desiredResponse}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-400">{tr('weight')}</span>
                    <span className="text-sm text-slate-600">{q.weight}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ subsection */}
        <div className="border-t border-slate-100 pt-4 mt-2 flex flex-col gap-3">
          <Typography variant="body" weight="semibold" className="text-slate-600">
            {tr('faqTitle')}
          </Typography>
          {faq.length === 0 ? (
            <p className="text-sm text-slate-400">{tr('noFaq')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {faq.map((item, i) => (
                <div key={i} className="border border-slate-100 rounded-xl p-4 flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700">{item.question}</span>
                  <span className="text-sm text-slate-600">{item.answer}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Card 3: Descripción para Talentum */}
      <Card title={tr('talentumDescription')}>
        {generatedDescription == null ? (
          <div className="flex items-center gap-2 text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{tr('loadingDescription')}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {generatedDescription}
          </p>
        )}
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={isPublishing}>
          {cc('back')}
        </Button>
        <Button type="button" variant="primary" size="sm"
          onClick={onPublish} disabled={isPublishing || generatedDescription == null}
          className="flex items-center gap-2 bg-emerald-600 border-emerald-600 hover:bg-emerald-700">
          {isPublishing && <Loader2 className="w-4 h-4 animate-spin" />}
          {isPublishing ? cc('publishing') : cc('publishButton')}
        </Button>
      </div>
    </div>
  );
}
