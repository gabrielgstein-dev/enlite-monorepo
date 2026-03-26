export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse" role="status" aria-label="Carregando...">
      {/* Title */}
      <div className="h-8 bg-gray-200 rounded w-64" />

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 bg-gray-200 rounded w-20" />
        <div className="h-9 bg-gray-200 rounded w-20" />
        <div className="h-9 bg-gray-200 rounded w-20" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-8 bg-gray-200 rounded w-16" />
            <div className="h-3 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="h-4 bg-gray-200 rounded w-32 mb-6" />
        <div className="flex items-end gap-2 h-40">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-200 rounded-t"
              style={{ height: `${30 + (i % 5) * 20}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
