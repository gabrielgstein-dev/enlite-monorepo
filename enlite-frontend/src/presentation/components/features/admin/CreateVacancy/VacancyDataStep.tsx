import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { SchedulePicker } from '../VacancySchedulePicker';
import {
  vacancyFormSchema,
  type VacancyFormData,
  DEFAULT_FORM_VALUES,
  STATUS_OPTIONS,
  PROFESSION_OPTIONS,
  SEX_OPTIONS,
  DEVICE_OPTIONS,
  DEPENDENCY_OPTIONS,
  WORK_SCHEDULE_OPTIONS,
  PROVINCE_OPTIONS,
} from '../vacancy-form-schema';

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

const inputCls =
  'border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30';
const selectCls = `${inputCls} bg-white`;

// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="border-t border-slate-200 pt-4 mt-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function Field({
  label, req, error, children,
}: {
  label: string; req?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}{req && ' *'}</label>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VacancyDataStepProps {
  initialData: VacancyFormData | null;
  caseNumber: number | null;
  onCaseNumberChange: (n: number | null) => void;
  onNext: (data: VacancyFormData) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VacancyDataStep({ initialData, caseNumber, onCaseNumberChange, onNext, onCancel }: VacancyDataStepProps) {
  const { t } = useTranslation();
  const tp = (k: string) => t(`admin.vacancyDetail.vacancyForm.${k}`);
  const tc = (k: string) => t(`admin.createVacancy.${k}`);

  const {
    register, handleSubmit, reset, control, setValue,
    formState: { errors },
  } = useForm<VacancyFormData>({
    resolver: zodResolver(vacancyFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    } else {
      reset(DEFAULT_FORM_VALUES);
      if (caseNumber != null) {
        setValue('title', `CASO ${caseNumber}`);
      }
    }
  }, [initialData, caseNumber, reset, setValue]);

  const onSubmit = (data: VacancyFormData) => {
    onNext(data);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <Typography variant="h3" weight="semibold" className="text-[#737373] font-poppins mb-5">
        {tp('createTitle')}
      </Typography>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Información del Caso */}
        <SectionHeader label={tp('sectionCaseInfo')} />

        {caseNumber != null && (
          <Field label={tp('caseNumber')}>
            <input type="number" min={1} value={caseNumber ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  onCaseNumberChange(null);
                } else {
                  const n = Number(val);
                  onCaseNumberChange(n);
                  if (n > 0) setValue('title', `CASO ${n}`);
                }
              }}
              className={inputCls} />
          </Field>
        )}

        <Field label={tp('title')} error={errors.title ? tp('validation.titleMin') : undefined}>
          <input type="text" {...register('title')} className={inputCls} />
        </Field>

        <Field label={tp('status')}>
          <select {...register('status')} className={selectCls}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{tp(`statusOptions.${o}`)}</option>
            ))}
          </select>
        </Field>

        {/* Perfil Profesional Buscado */}
        <SectionHeader label={tp('sectionProfessionalProfile')} />

        <Field label={tp('requiredProfessions')} req
          error={errors.required_professions ? tp('validation.requiredProfessionsMin') : undefined}>
          <Controller name="required_professions" control={control} render={({ field }) => (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {PROFESSION_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={field.value.includes(opt)}
                    onChange={(e) => field.onChange(
                      e.target.checked
                        ? [...field.value, opt]
                        : field.value.filter((v: string) => v !== opt),
                    )}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30" />
                  {tp(`professionOptions.${opt}`)}
                </label>
              ))}
            </div>
          )} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tp('requiredSex')}>
            <select {...register('required_sex')} className={selectCls}>
              <option value="">{tp('sexOptions.unspecified')}</option>
              {SEX_OPTIONS.map((o) => (
                <option key={o} value={o}>{tp(`sexOptions.${o}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={tp('providersNeeded')} req
            error={errors.providers_needed ? tp('validation.providersMin') : undefined}>
            <input type="number" min={1} {...register('providers_needed', { valueAsNumber: true })}
              className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tp('ageRangeMin')}
            error={errors.age_range_min ? tp('validation.ageRangeMinInvalid') : undefined}>
            <input type="number" min={18} placeholder="18" className={inputCls}
              {...register('age_range_min', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })} />
          </Field>
          <Field label={tp('ageRangeMax')}
            error={errors.age_range_max ? tp('validation.ageRangeInvalid') : undefined}>
            <input type="number" placeholder="65" className={inputCls}
              {...register('age_range_max', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })} />
          </Field>
        </div>

        <Field label={tp('requiredExperience')}>
          <textarea {...register('required_experience')} rows={2} className={`${inputCls} resize-none`} />
        </Field>

        <Field label={tp('workerAttributes')}>
          <textarea {...register('worker_attributes')} rows={2} className={`${inputCls} resize-none`} />
        </Field>

        {/* Ubicación y Horarios */}
        <SectionHeader label={tp('sectionLocationSchedule')} />

        <div className="grid grid-cols-2 gap-4">
          <Field label={tp('state')} req
            error={errors.state ? tp('validation.stateRequired') : undefined}>
            <select {...register('state')} className={selectCls}>
              <option value="">{tp('selectPlaceholder')}</option>
              {PROVINCE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label={tp('city')} req
            error={errors.city ? tp('validation.cityMin') : undefined}>
            <input type="text" {...register('city')} className={inputCls} />
          </Field>
        </div>

        <Field label={tp('serviceDeviceTypes')} req
          error={errors.service_device_types ? tp('validation.serviceDeviceTypesMin') : undefined}>
          <Controller name="service_device_types" control={control} render={({ field }) => (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DEVICE_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={field.value.includes(opt)}
                    onChange={(e) => field.onChange(
                      e.target.checked
                        ? [...field.value, opt]
                        : field.value.filter((v: string) => v !== opt),
                    )}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30" />
                  {tp(`deviceOptions.${opt}`)}
                </label>
              ))}
            </div>
          )} />
        </Field>

        <Field label={tp('workSchedule')}>
          <select {...register('work_schedule')} className={selectCls}>
            <option value="">{tp('selectPlaceholder')}</option>
            {WORK_SCHEDULE_OPTIONS.map((o) => (
              <option key={o} value={o}>{tp(`workScheduleOptions.${o}`)}</option>
            ))}
          </select>
        </Field>

        <Field label={tp('schedule')} req
          error={errors.schedule ? tp('validation.scheduleRequired') : undefined}>
          <Controller name="schedule" control={control} render={({ field }) => (
            <SchedulePicker value={field.value} onChange={field.onChange} />
          )} />
        </Field>

        {/* Información Clínica */}
        <SectionHeader label={tp('sectionClinicalInfo')} />

        <Field label={tp('pathologyTypes')}>
          <textarea {...register('pathology_types')} rows={2}
            placeholder={tp('pathologyTypesPlaceholder')} className={`${inputCls} resize-none`} />
        </Field>

        <Field label={tp('dependencyLevel')}>
          <select {...register('dependency_level')} className={selectCls}>
            <option value="">{tp('selectPlaceholder')}</option>
            {DEPENDENCY_OPTIONS.map((o) => (
              <option key={o} value={o}>{tp(`dependencyOptions.${o}`)}</option>
            ))}
          </select>
        </Field>

        {/* Condiciones */}
        <SectionHeader label={tp('sectionConditions')} />

        <div className="grid grid-cols-2 gap-4">
          <Field label={tp('salaryText')}>
            <input type="text" {...register('salary_text')} placeholder="A convenir" className={inputCls} />
          </Field>
          <Field label={tp('paymentDay')}>
            <input type="text" {...register('payment_day')}
              placeholder={tp('paymentDayPlaceholder')} className={inputCls} />
          </Field>
        </div>

        {/* Observaciones */}
        <Field label={tp('observations')}>
          <textarea {...register('daily_obs')} rows={2} className={`${inputCls} resize-none`} />
        </Field>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" size="sm">
            {tc('next')}
          </Button>
        </div>
      </form>
    </div>
  );
}
