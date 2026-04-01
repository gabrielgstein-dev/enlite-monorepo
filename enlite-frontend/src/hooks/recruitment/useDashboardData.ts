import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface DashboardDataFilters {
  startDate?: string;
  endDate?: string;
}

export function useDashboardData(filters?: DashboardDataFilters) {
  const [clickUpData, setClickUpData] = useState<any[]>([]);
  const [talentumData, setTalentumData] = useState<any[]>([]);
  const [pubData, setPubData] = useState<any[]>([]);
  const [baseData, setBaseData] = useState<any[]>([]);
  const [progresoData, setProgresoData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const [clickUp, talentum, progreso, publications, encuadres] = await Promise.all([
          AdminApiService.getClickUpCases(filters),
          AdminApiService.getTalentumWorkers(filters),
          AdminApiService.getProgresoWorkers(filters),
          AdminApiService.getPublications(filters),
          AdminApiService.getEncuadres(filters)
        ]);

        setClickUpData(clickUp);
        setTalentumData(talentum);
        setProgresoData(progreso);
        setPubData(publications);
        setBaseData(encuadres);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch dashboard data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.startDate, filters?.endDate]);

  return {
    clickUpData,
    talentumData,
    pubData,
    baseData,
    progresoData,
    isLoading,
    error
  };
}
