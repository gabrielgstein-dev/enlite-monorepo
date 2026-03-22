/**
 * PublicationsBarChart Organism
 * Simple bar chart for publications by channel (CSS-based, no external library)
 */

interface PublicationsBarChartProps {
  data: Array<{ name: string; value: number }>;
  className?: string;
}

export function PublicationsBarChart({
  data,
  className = '',
}: PublicationsBarChartProps): JSX.Element {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No hay datos de publicaciones para mostrar
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className={`space-y-3 ${className}`}>
      {data.map((item, idx) => {
        const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

        return (
          <div key={`${item.name}-${idx}`} className="flex items-center gap-3">
            <div className="w-24 text-sm font-medium text-slate-700 dark:text-slate-300 text-right flex-shrink-0">
              {item.name}
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-8 relative overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary to-primary/80 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                style={{ width: `${percentage}%` }}
              >
                <span className="text-white text-sm font-semibold">{item.value}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
