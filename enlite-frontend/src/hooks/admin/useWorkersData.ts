import { useState, useEffect } from 'react';
import { AdminApiService, WorkerDateStats } from '@infrastructure/http/AdminApiService';

interface UseWorkersDataFilters {
  platform?: string;
  docs_complete?: string;
  search?: string;
  case_id?: string;
  limit?: string;
  offset?: string;
}

const STATS_FALLBACK: WorkerDateStats = { today: 0, yesterday: 0, sevenDaysAgo: 0 };

export function useWorkersData(filters?: UseWorkersDataFilters) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorkerDateStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const [workersResult, statsResult] = await Promise.all([
          AdminApiService.listWorkers(filters),
          AdminApiService.getWorkerDateStats().catch(() => STATS_FALLBACK),
        ]);

        setWorkers(workersResult.data ?? []);
        setTotal(workersResult.total ?? 0);
        setStats(statsResult);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch workers');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.platform, filters?.docs_complete, filters?.search, filters?.case_id, filters?.limit, filters?.offset]);

  return { workers, total, stats, isLoading, error };
}
