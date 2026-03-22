/**
 * MetricCard Atom
 * Displays a metric with title, value, and optional subtitle
 * Used in recruitment dashboard for displaying KPIs
 */

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  onClick,
  className = '',
}: MetricCardProps): JSX.Element {
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between transition-all duration-200 ${
        isClickable ? 'cursor-pointer hover:shadow-md hover:border-primary' : ''
      } ${className}`}
    >
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
        <h4 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</h4>
      </div>
      {subtitle && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{subtitle}</p>
      )}
    </div>
  );
}
