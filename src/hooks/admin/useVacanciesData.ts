import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface UseVacanciesDataFilters {
  search?: string;
  client?: string;
  status?: string;
  limit?: string;
  offset?: string;
}

export function useVacanciesData(filters?: UseVacanciesDataFilters) {
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const [vacanciesData, statsData] = await Promise.all([
          AdminApiService.listVacancies(filters),
          AdminApiService.getVacanciesStats()
        ]);

        setVacancies(vacanciesData.data);
        setTotal(vacanciesData.total);
        setStats(statsData);
      } catch (err: any) {
        console.error('[useVacanciesData] Error fetching data:', err);
        setError(err.message || 'Failed to fetch vacancies data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [filters?.search, filters?.client, filters?.status, filters?.limit, filters?.offset]);

  return {
    vacancies,
    stats,
    total,
    isLoading,
    error,
    refetch: () => {
      setIsLoading(true);
      // Trigger re-fetch by updating a dependency
    }
  };
}
