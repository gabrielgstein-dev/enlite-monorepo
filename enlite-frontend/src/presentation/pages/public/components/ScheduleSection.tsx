import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';

const DAY_ORDER = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_LABELS: Record<string, string> = {
  domingo: 'Domingo:',
  lunes: 'Lunes:',
  martes: 'Martes:',
  miercoles: 'Miércoles:',
  jueves: 'Jueves:',
  viernes: 'Viernes:',
  sabado: 'Sábado:',
};

interface ScheduleSectionProps {
  schedule: Record<string, { start: string; end: string }[]>;
}

export function ScheduleSection({ schedule }: ScheduleSectionProps) {
  const { t } = useTranslation();
  const activeDays = DAY_ORDER.filter((day) => (schedule[day] ?? []).length > 0);

  if (activeDays.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        <span className="font-lexend font-medium text-sm text-gray-500">
          {t('publicVacancy.daysAndHours')}
        </span>
      </div>
      <div className="ml-6 space-y-2">
        {activeDays.map((day) => (
          <div key={day} className="flex items-center gap-4">
            <span className="font-lexend font-medium text-sm text-gray-500 w-28 shrink-0">
              {DAY_LABELS[day]}
            </span>
            <div className="flex gap-2 flex-wrap">
              {(schedule[day] ?? []).map((slot, i) => (
                <span
                  key={i}
                  className="bg-primary text-white text-xs font-lexend font-medium px-3 py-1 rounded"
                >
                  {slot.start} - {slot.end}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
