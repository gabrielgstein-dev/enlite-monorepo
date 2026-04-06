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

  return (
    <div className="flex flex-col gap-2">
      {/* Título com ícone */}
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-[15px] h-3 text-primary shrink-0" />
        <span className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
          {t('publicVacancy.daysAndHours')}
        </span>
      </div>
      {/* Grid de dias e horários */}
      <div className="ml-6 flex gap-4">
        {/* Coluna de dias */}
        <div className="flex flex-col gap-3 w-[103px] shrink-0">
          {DAY_ORDER.map((day) => (
            <p key={day} className="font-lexend font-medium text-sm leading-[1.4] text-[#737373]">
              {DAY_LABELS[day]}
            </p>
          ))}
        </div>
        {/* Coluna de horários */}
        <div className="flex flex-col gap-2">
          {DAY_ORDER.map((day) => (
            <div key={day} className="flex gap-2 flex-wrap min-h-[24px] items-center">
              {(schedule[day] ?? []).map((slot, i) => (
                <span
                  key={i}
                  className="bg-primary text-[#edf2fe] text-xs font-lexend font-medium px-3 py-1 rounded tracking-[0.04px] leading-4"
                >
                  {slot.start} - {slot.end}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
