import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { WorkerDetail } from '@domain/entities/Worker';

export function useWorkerDetail(workerId: string | undefined) {
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workerId) return;

    let cancelled = false;

    async function fetchWorker() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await AdminApiService.getWorkerById(workerId!);
        if (!cancelled) setWorker(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Falha ao carregar worker');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWorker();
    return () => { cancelled = true; };
  }, [workerId]);

  const refetch = () => {
    if (!workerId) return;
    setIsLoading(true);
    setError(null);
    AdminApiService.getWorkerById(workerId)
      .then(data => setWorker(data))
      .catch(err => setError(err.message || 'Falha ao carregar worker'))
      .finally(() => setIsLoading(false));
  };

  return { worker, isLoading, error, refetch };
}
