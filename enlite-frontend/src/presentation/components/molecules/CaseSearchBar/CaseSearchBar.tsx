/**
 * CaseSearchBar Molecule
 * Search input for finding specific recruitment cases
 */

import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

interface CaseSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CaseSearchBar({
  value,
  onChange,
  placeholder,
  className = '',
}: CaseSearchBarProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={`flex-1 ${className}`}>
      <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
        {t('admin.recruitment.caseAnalysis.searchLabel')}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
        <input
          type="text"
          placeholder={placeholder || t('admin.recruitment.caseAnalysis.searchPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full pl-10 pr-3 py-3 border border-slate-300 dark:border-slate-600 rounded-xl leading-5 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm transition-all text-slate-900 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
