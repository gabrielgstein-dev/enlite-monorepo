import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface UseVacanciesDataFilters {
  search?: string;
  client?: string;
  status?: string;
  priority?: string;
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

        console.log('[useVacanciesData] Fetching with filters:', filters);

        const [vacanciesData, statsData] = await Promise.all([
          AdminApiService.listVacancies(filters),
          AdminApiService.getVacanciesStats()
        ]);

        console.log('[useVacanciesData] Raw API response:', vacanciesData);
        console.log('[useVacanciesData] Data array:', vacanciesData.data);
        console.log('[useVacanciesData] Total:', vacanciesData.total);
        console.log('[useVacanciesData] Data array length:', vacanciesData.data?.length);
        console.log('[useVacanciesData] Stats data:', statsData);

        const dataArray = vacanciesData.data || [];
        const totalCount = vacanciesData.total || 0;
        const statsArray = statsData || [];

        console.log('[useVacanciesData] Setting vacancies:', dataArray);
        console.log('[useVacanciesData] Setting total:', totalCount);
        console.log('[useVacanciesData] Setting stats:', statsArray);

        setVacancies(dataArray);
        setTotal(totalCount);
        setStats(statsArray);

        console.log('[useVacanciesData] State updated - vacancies count:', dataArray.length);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch vacancies data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.search, filters?.client, filters?.status, filters?.priority, filters?.limit, filters?.offset]);

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
