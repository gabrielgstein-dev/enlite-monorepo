import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { DAY_KEYS, DAY_LABELS, type DayKey, type ScheduleEntry, type ScheduleValue } from './vacancyScheduleUtils';

interface SchedulePickerProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  error?: string;
}

const EMPTY_ENTRY: ScheduleEntry = { days: [], timeFrom: '', timeTo: '' };

export function SchedulePicker({ value, onChange, error }: SchedulePickerProps) {
  const { t } = useTranslation();
  const entries = value.length > 0 ? value : [EMPTY_ENTRY];

  const updateEntry = (index: number, updated: ScheduleEntry) => {
    const next = [...entries];
    next[index] = updated;
    onChange(next);
  };

  const addEntry = () => onChange([...entries, { ...EMPTY_ENTRY }]);

  const removeEntry = (index: number) => {
    if (entries.length <= 1) return;
    onChange(entries.filter((_, i) => i !== index));
  };

  const toggleDay = (entryIndex: number, key: DayKey) => {
    const entry = entries[entryIndex];
    const next = entry.days.includes(key)
      ? entry.days.filter((d) => d !== key)
      : [...entry.days, key];
    updateEntry(entryIndex, { ...entry, days: next });
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, idx) => (
        <div
          key={idx}
          className={[
            'flex flex-col gap-3 p-3 rounded-lg border border-[#D9D9D9]',
            entries.length > 1 ? 'bg-slate-50/50' : '',
          ].join(' ')}
        >
          {/* Header with remove button */}
          {entries.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                {t('admin.vacancyDetail.vacancyForm.scheduleBlock')} {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Day chips */}
          <div>
            <span className="text-xs font-medium text-slate-500 mb-1 block">
              {t('admin.vacancyDetail.vacancyForm.scheduleDays')}
            </span>
            <div className="flex flex-wrap gap-2">
              {DAY_KEYS.map((key) => {
                const selected = entry.days.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(idx, key)}
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

          {/* Time inputs */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-slate-500">
                {t('admin.vacancyDetail.vacancyForm.scheduleFrom')}
              </label>
              <input
                type="time"
                value={entry.timeFrom}
                onChange={(e) => updateEntry(idx, { ...entry, timeFrom: e.target.value })}
                className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-slate-500">
                {t('admin.vacancyDetail.vacancyForm.scheduleTo')}
              </label>
              <input
                type="time"
                value={entry.timeTo}
                onChange={(e) => updateEntry(idx, { ...entry, timeTo: e.target.value })}
                className="border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Preview */}
          {entry.days.length > 0 && entry.timeFrom && entry.timeTo && (
            <p className="text-xs text-slate-400 italic">
              {entry.days.map((k) => DAY_LABELS[k as DayKey] ?? k).join(', ')} {entry.timeFrom}-{entry.timeTo}
            </p>
          )}
        </div>
      ))}

      {/* Add block button */}
      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors self-start"
      >
        <Plus className="w-3.5 h-3.5" />
        {t('admin.vacancyDetail.vacancyForm.addScheduleBlock')}
      </button>

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
