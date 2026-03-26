export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-4 animate-pulse" role="status" aria-label="Carregando...">
      {/* Title + action button */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-9 bg-gray-200 rounded w-44" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 flex gap-4">
          <div className="h-4 bg-gray-200 rounded w-8" />
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-4 bg-gray-200 rounded w-20" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4 border-t border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-8" />
            <div className="h-4 bg-gray-200 rounded" style={{ width: `${140 + (i % 3) * 20}px` }} />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
