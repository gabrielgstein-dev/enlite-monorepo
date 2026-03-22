/**
 * StatusBadge Atom
 * Displays a status badge with color coding for recruitment cases
 */

type CaseStatus = 'BUSQUEDA' | 'REEMPLAZOS' | 'REEMPLAZO';

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

const statusConfig: Record<CaseStatus, { label: string; bgColor: string; textColor: string }> = {
  BUSQUEDA: {
    label: 'Búsqueda',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
  REEMPLAZOS: {
    label: 'Reemplazos',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  REEMPLAZO: {
    label: 'Reemplazo',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps): JSX.Element {
  const config = statusConfig[status];

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor} ${className}`}
    >
      {config.label}
    </span>
  );
}
