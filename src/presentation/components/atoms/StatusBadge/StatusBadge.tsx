/**
 * StatusBadge Atom
 * Displays a status badge with color coding for recruitment cases
 */
import { useTranslation } from 'react-i18next';

type CaseStatus = 'BUSQUEDA' | 'REEMPLAZOS' | 'REEMPLAZO';

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

const statusConfig: Record<CaseStatus, { labelKey: string; bgColor: string; textColor: string }> = {
  BUSQUEDA: {
    labelKey: 'jobs.caseStatus.search',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
  REEMPLAZOS: {
    labelKey: 'jobs.caseStatus.replacements',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  REEMPLAZO: {
    labelKey: 'jobs.caseStatus.replacement',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps): JSX.Element {
  const { t } = useTranslation();
  const config = statusConfig[status];

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor} ${className}`}
    >
      {t(config.labelKey)}
    </span>
  );
}
