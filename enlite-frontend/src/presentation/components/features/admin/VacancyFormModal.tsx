import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

const vacancyFormSchema = z.object({
  case_number: z.string().min(1),
  title: z.string().min(3),
  patient_id: z.string().uuid(),
  worker_profile_sought: z.string().min(1),
  schedule_days_hours: z.string().min(1),
  providers_needed: z.number().min(1),
  daily_obs: z.string().optional(),
  status: z.string().optional(),
});

type VacancyFormData = z.infer<typeof vacancyFormSchema>;

interface VacancyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vacancyId: string) => void;
  vacancy?: any;
}

const STATUS_OPTIONS = ['BUSQUEDA', 'REEMPLAZO', 'CUBIERTO', 'CANCELADO'] as const;

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VacancyFormData>({
    resolver: zodResolver(vacancyFormSchema),
    defaultValues: {
      case_number: '',
      title: '',
      patient_id: '',
      worker_profile_sought: '',
      schedule_days_hours: '',
      providers_needed: 1,
      daily_obs: '',
      status: 'BUSQUEDA',
    },
  });

  useEffect(() => {
    if (isOpen) {
      setApiError(null);
      if (vacancy) {
        reset({
          case_number: vacancy.case_number != null ? String(vacancy.case_number) : '',
          title: vacancy.title ?? '',
          patient_id: vacancy.patient_id ?? '',
          worker_profile_sought: vacancy.worker_profile_sought ?? '',
          schedule_days_hours: vacancy.schedule_days_hours ?? '',
          providers_needed: vacancy.providers_needed ?? 1,
          daily_obs: vacancy.daily_obs ?? '',
          status: vacancy.status ?? 'BUSQUEDA',
        });
      } else {
        reset({
          case_number: '',
          title: '',
          patient_id: '',
          worker_profile_sought: '',
          schedule_days_hours: '',
          providers_needed: 1,
          daily_obs: '',
          status: 'BUSQUEDA',
        });
      }
    }
  }, [isOpen, vacancy, reset]);

  const onSubmit = async (data: VacancyFormData) => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      if (isEditMode) {
        await AdminApiService.updateVacancy(vacancy.id, data);
        onSuccess(vacancy.id);
      } else {
        const result = await AdminApiService.createVacancy(data);
        onSuccess(result.id ?? result.vacancy?.id ?? result);
      }
    } catch (err: any) {
      setApiError(err?.message ?? t('admin.vacancyDetail.vacancyForm.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const title = isEditMode
    ? t('admin.vacancyDetail.vacancyForm.editTitle')
    : t('admin.vacancyDetail.vacancyForm.createTitle');

  const submitLabel = isEditMode
    ? isSubmitting
      ? t('admin.vacancyDetail.vacancyForm.saving')
      : t('admin.vacancyDetail.vacancyForm.save')
    : isSubmitting
    ? t('admin.vacancyDetail.vacancyForm.creating')
    : t('admin.vacancyDetail.vacancyForm.create');

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <Typography variant="h3" weight="semibold" className="text-[#737373] font-poppins">
            {title}
          </Typography>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-red-500 transition-colors p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.caseNumber')} *
            </label>
            <input
              type="number"
              {...register('case_number')}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.case_number && (
              <span className="text-xs text-red-500">
                {t('admin.vacancyDetail.vacancyForm.validation.caseNumberRequired')}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.title')} *
            </label>
            <input
              type="text"
              {...register('title')}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.title && (
              <span className="text-xs text-red-500">
                {t('admin.vacancyDetail.vacancyForm.validation.titleMin')}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.patientId')} *
            </label>
            <input
              type="text"
              {...register('patient_id')}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.patient_id && (
              <span className="text-xs text-red-500">
                {errors.patient_id.type === 'invalid_string'
                  ? t('admin.vacancyDetail.vacancyForm.validation.patientIdInvalid')
                  : t('admin.vacancyDetail.vacancyForm.validation.patientIdRequired')}
              </span>
            )}
          </div>

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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('admin.vacancyDetail.vacancyForm.schedule')} *
            </label>
            <textarea
              {...register('schedule_days_hours')}
              rows={2}
              className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            {errors.schedule_days_hours && (
              <span className="text-xs text-red-500">
                {t('admin.vacancyDetail.vacancyForm.validation.scheduleRequired')}
              </span>
            )}
          </div>

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

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <Typography variant="body" className="text-red-600 text-sm">
                {apiError}
              </Typography>
            </div>
          )}

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
