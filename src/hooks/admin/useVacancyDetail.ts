import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export function useVacancyDetail(vacancyId: string | undefined) {
  const [vacancy, setVacancy] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vacancyId) return;

    let cancelled = false;

    async function fetchVacancy() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await AdminApiService.getVacancyById(vacancyId!);
        if (!cancelled) setVacancy(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Falha ao carregar vaga');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchVacancy();
    return () => { cancelled = true; };
  }, [vacancyId]);

  const refetch = () => {
    if (!vacancyId) return;
    setIsLoading(true);
    AdminApiService.getVacancyById(vacancyId)
      .then(data => setVacancy(data))
      .catch(err => setError(err.message || 'Falha ao carregar vaga'))
      .finally(() => setIsLoading(false));
  };

  return { vacancy, isLoading, error, refetch };
}
