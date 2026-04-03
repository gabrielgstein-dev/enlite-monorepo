import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { SchedulePicker } from './VacancySchedulePicker';
import {
  parseScheduleString,
  serializeSchedule,
  type ScheduleValue,
} from './vacancyScheduleUtils';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const scheduleEntrySchema = z.object({
  days: z.array(z.string()).min(1),
  timeFrom: z.string().min(1),
  timeTo: z.string().min(1),
});

const vacancyFormSchema = z.object({
  title: z.string().min(3),
  status: z.string().optional(),
  worker_profile_sought: z.string().min(1),
  schedule: z.array(scheduleEntrySchema).min(1),
  providers_needed: z.number().min(1),
  daily_obs: z.string().optional(),
});

type VacancyFormData = z.infer<typeof vacancyFormSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SCHEDULE: ScheduleValue = [{ days: [], timeFrom: '', timeTo: '' }];

function buildScheduleFromVacancy(raw: string | undefined): ScheduleValue {
  if (!raw) return DEFAULT_SCHEDULE;
  return parseScheduleString(raw) ?? DEFAULT_SCHEDULE;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VacancyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vacancyId: string) => void;
  vacancy?: any;
}

const STATUS_OPTIONS = ['BUSQUEDA', 'REEMPLAZO', 'CUBIERTO', 'CANCELADO'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VacancyFormModal({
  isOpen,
  onClose,
  onSuccess,
  vacancy,
}: VacancyFormModalProps) {
  const { t } = useTranslation();
  const isEditMode = Boolean(vacancy);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<VacancyFormData>({
    resolver: zodResolver(vacancyFormSchema),
    defaultValues: {
      title: '',
      status: 'BUSQUEDA',
      worker_profile_sought: '',
      schedule: DEFAULT_SCHEDULE,
      providers_needed: 1,
      daily_obs: '',
    },
  });

  // Sync form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setApiError(null);

    if (vacancy) {
      reset({
        title: vacancy.title ?? '',
        status: vacancy.status ?? 'BUSQUEDA',
        worker_profile_sought: vacancy.worker_profile_sought ?? '',
        schedule: buildScheduleFromVacancy(vacancy.schedule_days_hours),
        providers_needed: vacancy.providers_needed ?? 1,
        daily_obs: vacancy.daily_obs ?? '',
      });
    } else {
      reset({
        title: '',
        status: 'BUSQUEDA',
        worker_profile_sought: '',
        schedule: DEFAULT_SCHEDULE,
        providers_needed: 1,
        daily_obs: '',
      });

      // Auto-generate title from next case number
      setIsLoadingTitle(true);
      AdminApiService.getNextCaseNumber()
        .then((nextNumber) => {
          setValue('title', `CASO ${nextNumber}`);
        })
        .catch(() => {
          // Non-fatal: title stays empty, user can't submit without it
        })
        .finally(() => setIsLoadingTitle(false));
    }
  }, [isOpen, vacancy, reset, setValue]);

  const onSubmit = async (data: VacancyFormData) => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      const payload = {
        title: data.title,
        worker_profile_sought: data.worker_profile_sought,
        schedule_days_hours: serializeSchedule(data.schedule),
        providers_needed: data.providers_needed,
        daily_obs: data.daily_obs,
        status: data.status,
        patient_id: null,
      };

      if (isEditMode) {
        await AdminApiService.updateVacancy(vacancy.id, payload);
        onSuccess(vacancy.id);
      } else {
        const result = await AdminApiService.createVacancy(payload);
        onSuccess(result.id ?? result.vacancy?.id ?? result);
      }
    } catch (err: any) {
      setApiError(err?.message ?? t('admin.vacancyDetail.vacancyForm.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  const modalTitle = isEditMode
    ? t('admin.vacancyDetail.vacancyForm.editTitle')
    : t('admin.vacancyDetail.vacancyForm.createTitle');

  const submitLabel = isEditMode
    ? isSubmitting
      ? t('admin.vacancyDetail.vacancyForm.saving')
      : t('admin.vacancyDetail.vacancyForm.save')
    : isSubmitting
    ? t('admin.vacancyDetail.vacancyForm.creating')
    : t('admin.vacancyDetail.vacancyForm.create');

  // ---------------------------------------------------------------------------
  // Derived schedule errors
  // ---------------------------------------------------------------------------
  const scheduleError = errors.schedule
    ? (errors.schedule as any)?.days ?? (errors.schedule as any)?.[0]?.days
      ? t('admin.vacancyDetail.vacancyForm.validation.scheduleDaysRequired')
      : t('admin.vacancyDetail.vacancyForm.validation.scheduleTimeRequired')
    : undefined;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Typography variant="h3" weight="semibold" className="text-[#737373] font-poppins">
            {modalTitle}
          </Typography>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-red-500 transition-colors p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title (auto-generated from case number, read-only) */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.title')}
            </label>
            <input
              type="text"
              {...register('title')}
              readOnly
              disabled={isLoadingTitle}
              className={[
                'border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 cursor-default focus:outline-none',
                isLoadingTitle ? 'opacity-50' : '',
              ].join(' ')}
            />
          </div>

          {/* Status — right below title */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.status')}
            </label>
            <select
              {...register('status')}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`admin.vacancyDetail.vacancyForm.statusOptions.${opt}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Profile Sought */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.profileSought')} *
            </label>
            <textarea
              {...register('worker_profile_sought')}
              rows={3}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            {errors.worker_profile_sought && (
              <span className="text-xs text-red-500">
                {t('admin.vacancyDetail.vacancyForm.validation.profileRequired')}
              </span>
            )}
          </div>

          {/* Schedule Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.schedule')} *
            </label>
            <Controller
              name="schedule"
              control={control}
              render={({ field }) => (
                <SchedulePicker
                  value={field.value}
                  onChange={field.onChange}
                  error={scheduleError}
                />
              )}
            />
          </div>

          {/* Providers Needed */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.providersNeeded')} *
            </label>
            <input
              type="number"
              min={1}
              {...register('providers_needed', { valueAsNumber: true })}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.providers_needed && (
              <span className="text-xs text-red-500">
                {t('admin.vacancyDetail.vacancyForm.validation.providersMin')}
              </span>
            )}
          </div>

          {/* Observations */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.observations')}
            </label>
            <textarea
              {...register('daily_obs')}
              rows={2}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* API Error */}
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <Typography variant="body" className="text-red-600 text-sm">
                {apiError}
              </Typography>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('admin.vacancyDetail.vacancyForm.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
