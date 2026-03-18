import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { availabilitySchema, AvailabilityFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { WizardNavigation } from '../WizardNavigation';

interface AvailabilityStepProps {
  onValidationChange?: (isValid: boolean) => void;
}

const DAYS_OF_WEEK = [
  { id: 'sunday', key: 'sunday' },
  { id: 'monday', key: 'monday' },
  { id: 'tuesday', key: 'tuesday' },
  { id: 'wednesday', key: 'wednesday' },
  { id: 'thursday', key: 'thursday' },
  { id: 'friday', key: 'friday' },
  { id: 'saturday', key: 'saturday' },
];

export function AvailabilityStep({ onValidationChange }: AvailabilityStepProps) {
  const { t } = useTranslation();
  const { data, updateAvailability, markStepCompleted, markStepIncomplete, goToNextStep, workerId } = useWorkerRegistrationStore();
  const { saveStep } = useWorkerApi();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    watch,
    formState: { errors, isValid },
    setValue,
  } = useForm<AvailabilityFormData>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      schedule: data.availability.schedule || DAYS_OF_WEEK.map((day) => ({
        day: day.id,
        enabled: false,
        timeSlots: [],
      })),
    },
    mode: 'onChange',
  });

  const schedule = watch('schedule');
  const scheduleJson = useMemo(() => JSON.stringify(schedule), [schedule]);

  // Generate translated days array
  const translatedDays = useMemo(() => DAYS_OF_WEEK.map((day, index) => ({
    id: day.id,
    label: t(`workerRegistration.availability.${day.key}`),
    dayIndex: index,
  })), [t]);

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(isValid);
    }
    
    if (isValid) {
      markStepCompleted('availability');
    } else {
      markStepIncomplete('availability');
    }
  }, [isValid, markStepCompleted, markStepIncomplete, onValidationChange]);

  useEffect(() => {
    updateAvailability({ schedule });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleJson]);

  const toggleDay = (dayIndex: number) => {
    const currentEnabled = schedule[dayIndex]?.enabled || false;
    setValue(`schedule.${dayIndex}.enabled`, !currentEnabled, { shouldValidate: true });
  };

  const addTimeSlot = (dayIndex: number) => {
    const currentSlots = schedule[dayIndex]?.timeSlots || [];
    setValue(`schedule.${dayIndex}.timeSlots`, [
      ...currentSlots,
      { startTime: '09:00', endTime: '17:00' },
    ], { shouldValidate: true });
  };

  const removeTimeSlot = (dayIndex: number, slotIndex: number) => {
    const currentSlots = schedule[dayIndex]?.timeSlots || [];
    const newSlots = currentSlots.filter((_, i) => i !== slotIndex);
    setValue(`schedule.${dayIndex}.timeSlots`, newSlots, { shouldValidate: true });
  };

  const updateTimeSlot = (dayIndex: number, slotIndex: number, field: 'startTime' | 'endTime', value: string) => {
    const currentSlots = [...(schedule[dayIndex]?.timeSlots || [])];
    currentSlots[slotIndex] = { ...currentSlots[slotIndex], [field]: value };
    setValue(`schedule.${dayIndex}.timeSlots`, currentSlots, { shouldValidate: true });
  };

  const onSubmit = async () => {
    if (!workerId) {
      goToNextStep();
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      // Map schedule to backend format (dayOfWeek 0=Sun...6=Sat)
      const availability = schedule.flatMap((daySchedule, dayIndex) => {
        if (!daySchedule.enabled) return [];
        return (daySchedule.timeSlots || []).map((slot) => ({
          dayOfWeek: dayIndex,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }));
      });
      await saveStep(workerId, 4, { availability });
      goToNextStep();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('workerRegistration.availability.saveError'));
    } finally {
      setIsSaving(false);
    }
  };  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col items-start gap-7 w-[1200px] relative">
      <h2 className="relative flex items-center self-stretch mt-[-1.00px] font-lexend font-medium text-[#374151] text-[24px] tracking-[0] leading-[130%]">
        {t('workerRegistration.availability.title')}
      </h2>

      <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
        {translatedDays.map((day, dayIndex) => {
          const isEnabled = schedule[dayIndex]?.enabled || false;
          const timeSlots = schedule[dayIndex]?.timeSlots || [];

          return (
            <div
              key={day.id}
              className={`flex flex-col items-end px-10 py-7 relative self-stretch w-full flex-[0_0_auto] bg-white rounded-2xl border-2 border-solid transition-all duration-200
                ${isEnabled 
                  ? 'border-[#180149] gap-5' 
                  : 'border-[#4B5563] gap-6'
                }`}
            >
              <div className="flex w-[1120px] items-center justify-between relative flex-[0_0_auto]">
                <div className={`relative flex items-center w-fit mt-[-1.00px] font-lexend font-medium text-[24px] tracking-[0] leading-[130%] whitespace-nowrap transition-colors
                  ${isEnabled ? 'text-[#180149]' : 'text-[#374151]'}`}>
                  {day.label}
                </div>

                <div className="inline-flex items-center justify-center gap-3 relative flex-[0_0_auto]">
                  <div className="relative w-fit font-lexend font-medium text-[#374151] text-[16px] tracking-[0] leading-[150%] whitespace-nowrap">
                    {isEnabled && timeSlots.length > 0
                      ? t('workerRegistration.availability.timeSlotsCount', { count: timeSlots.length })
                      : t('workerRegistration.availability.timeSlots')}
                  </div>

                  <button
                    type="button"
                    onClick={() => isEnabled ? addTimeSlot(dayIndex) : toggleDay(dayIndex)}
                    className="inline-flex items-center justify-center gap-[6.32px] p-[7.58px] relative flex-[0_0_auto] rounded-[631.58px] cursor-pointer transition-colors bg-[#180149] hover:bg-[#2a0269]"
                  >
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 20 20" 
                      fill="none"
                      className="relative w-[15px] h-[15px]" 
                    >
                      <path d="M10 5V15M5 10H15" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {isEnabled && timeSlots.length > 0 && (
                <div className="flex w-full items-center justify-end relative mt-2">
                  <div className="gap-y-4 gap-x-4 flex items-center relative flex-wrap justify-end w-full max-w-full">
                    {timeSlots.map((slot, slotIndex) => (
                      <div key={slotIndex} className="gap-4 inline-flex items-center relative flex-[0_0_auto] h-[40px]">
                        {slotIndex > 0 && (
                          <div className="relative w-fit font-lexend font-medium text-[#374151] text-[24px] tracking-[0] leading-[31.2px] whitespace-nowrap">
                            |
                          </div>
                        )}
                        <div className="inline-flex items-center justify-center gap-2.5 px-3 py-1.5 relative flex-[0_0_auto] bg-[#180149] rounded-lg h-[40px] box-border">
                          <div className="relative flex items-center mt-[-1.00px] font-lexend font-medium text-white text-[16px] tracking-[0] leading-[150%] whitespace-nowrap">
                            <input
                              type="time"
                              value={slot.startTime}
                              onChange={(e) => updateTimeSlot(dayIndex, slotIndex, 'startTime', e.target.value)}
                              className="relative bg-transparent text-white focus:outline-none w-[54px] text-center cursor-pointer leading-none h-full m-0 p-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-10"
                            />
                            <span className="mx-1 leading-none h-full flex items-center">-</span>
                            <input
                              type="time"
                              value={slot.endTime}
                              onChange={(e) => updateTimeSlot(dayIndex, slotIndex, 'endTime', e.target.value)}
                              className="relative bg-transparent text-white focus:outline-none w-[54px] text-center cursor-pointer leading-none h-full m-0 p-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-10"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeTimeSlot(dayIndex, slotIndex)}
                          className="relative w-4 h-4 aspect-[1] cursor-pointer bg-transparent border-0 p-0 flex items-center justify-center text-[#180149] hover:text-red-500 transition-colors"
                        >
                           <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M8 9.70342L2.03802 15.6654C1.81496 15.8885 1.53105 16 1.18631 16C0.841571 16 0.557667 15.8885 0.3346 15.6654C0.111533 15.4423 0 15.1584 0 14.8137C0 14.4689 0.111533 14.185 0.3346 13.962L6.29658 8L0.3346 2.03802C0.111533 1.81496 0 1.53105 0 1.18631C0 0.841571 0.111533 0.557667 0.3346 0.3346C0.557667 0.111533 0.841571 0 1.18631 0C1.53105 0 1.81496 0.111533 2.03802 0.3346L8 6.29658L13.962 0.3346C14.185 0.111533 14.4689 0 14.8137 0C15.1584 0 15.4423 0.111533 15.6654 0.3346C15.8885 0.557667 16 0.841571 16 1.18631C16 1.53105 15.8885 1.81496 15.6654 2.03802L9.70342 8L15.6654 13.962C15.8885 14.185 16 14.4689 16 14.8137C16 15.1584 15.8885 15.4423 15.6654 15.6654C15.4423 15.8885 15.1584 16 14.8137 16C14.4689 16 14.185 15.8885 13.962 15.6654L8 9.70342Z"/>
                            </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {errors.schedule && (
        <p className="text-red-500 text-[14px] font-lexend font-medium self-start">{errors.schedule.message}</p>
      )}

      {saveError && (
        <p className="text-red-500 text-[14px] font-lexend font-medium self-start">{saveError}</p>
      )}

      <WizardNavigation isCurrentStepValid={isValid} isSubmitting={isSaving} />
    </form>
  );
}
