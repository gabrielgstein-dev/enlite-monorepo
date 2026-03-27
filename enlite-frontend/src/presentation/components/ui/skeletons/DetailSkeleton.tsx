export function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse" role="status" aria-label="Carregando...">
      {/* Breadcrumb */}
      <div className="h-4 bg-gray-200 rounded w-40" />

      {/* Title + action button */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-72" />
        <div className="h-9 bg-gray-200 rounded w-28" />
      </div>

      {/* Cards grid 2x2 */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
