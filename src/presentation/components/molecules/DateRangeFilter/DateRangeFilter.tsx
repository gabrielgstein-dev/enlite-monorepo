/**
 * DateRangeFilter Molecule
 * Allows users to filter data by date range with preset options
 */

import type { DateFilterType } from '@domain/entities/RecruitmentData';

interface DateRangeFilterProps {
  value: DateFilterType;
  onChange: (value: DateFilterType) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomStartChange?: (date: string) => void;
  onCustomEndChange?: (date: string) => void;
  className?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  customStartDate,
  customEndDate,
  onCustomStartChange,
  onCustomEndChange,
  className = '',
}: DateRangeFilterProps): JSX.Element {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Periodo:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DateFilterType)}
        className="text-sm border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-1.5 pl-3 pr-8 focus:ring-primary focus:border-primary"
      >
        <option value="all">Todo el tiempo</option>
        <option value="hoy">Hoy</option>
        <option value="ayer">Ayer</option>
        <option value="1w">Última Semana</option>
        <option value="1m">Último Mes</option>
        <option value="custom">Personalizado</option>
      </select>

      {value === 'custom' && onCustomStartChange && onCustomEndChange && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStartDate || ''}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="text-sm border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-1.5 px-3"
          />
          <span className="text-slate-400">-</span>
          <input
            type="date"
            value={customEndDate || ''}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="text-sm border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-1.5 px-3"
          />
        </div>
      )}
    </div>
  );
}
