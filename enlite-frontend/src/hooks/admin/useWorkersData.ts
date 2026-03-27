import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface UseWorkersDataFilters {
  platform?: string;
  docs_complete?: string;
  limit?: string;
  offset?: string;
}

export function useWorkersData(filters?: UseWorkersDataFilters) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const result = await AdminApiService.listWorkers(filters);

        setWorkers(result.data ?? []);
        setTotal(result.total ?? 0);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch workers');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.platform, filters?.docs_complete, filters?.limit, filters?.offset]);

  return { workers, total, isLoading, error };
}
