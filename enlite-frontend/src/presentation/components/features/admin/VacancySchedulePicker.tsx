import { useTranslation } from 'react-i18next';
import { DAY_KEYS, DAY_LABELS, type DayKey, type ScheduleValue } from './vacancyScheduleUtils';

interface SchedulePickerProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  error?: string;
}

export function SchedulePicker({ value, onChange, error }: SchedulePickerProps) {
  const { t } = useTranslation();

  const toggleDay = (key: DayKey) => {
    const next = value.days.includes(key)
      ? value.days.filter((d) => d !== key)
      : [...value.days, key];
    onChange({ ...value, days: next });
  };

  const preview =
    value.days.length > 0 && value.timeFrom && value.timeTo
      ? `${value.days.map((k) => DAY_LABELS[k as DayKey] ?? k).join(', ')} ${value.timeFrom}-${value.timeTo}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Chips de dias */}
      <div>
        <span className="text-xs font-medium text-slate-500 mb-1 block">
          {t('admin.vacancyDetail.vacancyForm.scheduleDays')}
        </span>
        <div className="flex flex-wrap gap-2">
          {DAY_KEYS.map((key) => {
            const selected = value.days.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors select-none',
                  selected
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-600 border-[#D9D9D9] hover:border-primary/60 hover:text-primary',
                ].join(' ')}
              >
                {t(`admin.vacancyDetail.vacancyForm.days.${key}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horários */}
      <div className="flex gap-4">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-slate-500">
            {t('admin.vacancyDetail.vacancyForm.scheduleFrom')}
          </label>
          <input
            type="time"
            value={value.timeFrom}
            onChange={(e) => onChange({ ...value, timeFrom: e.target.value })}
            className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-slate-500">
            {t('admin.vacancyDetail.vacancyForm.scheduleTo')}
          </label>
          <input
            type="time"
            value={value.timeTo}
            onChange={(e) => onChange({ ...value, timeTo: e.target.value })}
            className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Preview serializado */}
      {preview && (
        <p className="text-xs text-slate-400 italic">{preview}</p>
      )}

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
