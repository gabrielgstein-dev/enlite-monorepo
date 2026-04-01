import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface FunnelEncuadre {
  id: string;
  workerName: string | null;
  workerPhone: string | null;
  occupation: string | null;
  interviewDate: string | null;
  interviewTime: string | null;
  meetLink: string | null;
  resultado: string | null;
  attended: boolean | null;
  rejectionReasonCategory: string | null;
  rejectionReason: string | null;
  matchScore: number | null;
  talentumStatus: string | null;
  workZone: string | null;
  redireccionamiento: string | null;
}

export interface FunnelStages {
  INVITED: FunnelEncuadre[];
  INITIATED: FunnelEncuadre[];
  IN_PROGRESS: FunnelEncuadre[];
  COMPLETED: FunnelEncuadre[];
  CONFIRMED: FunnelEncuadre[];
  INTERVIEWING: FunnelEncuadre[];
  SELECTED: FunnelEncuadre[];
  REJECTED: FunnelEncuadre[];
  PENDING: FunnelEncuadre[];
}

interface FunnelData {
  stages: FunnelStages;
  totalEncuadres: number;
}

export function useEncuadreFunnel(vacancyId: string | undefined) {
  const [data, setData] = useState<FunnelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnel = useCallback(async () => {
    if (!vacancyId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await AdminApiService.getEncuadreFunnel(vacancyId) as FunnelData;
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel');
    } finally {
      setIsLoading(false);
    }
  }, [vacancyId]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  const moveEncuadre = useCallback(async (
    encuadreId: string,
    resultado: string,
    rejectionReasonCategory?: string,
  ) => {
    try {
      await AdminApiService.moveEncuadre(encuadreId, {
        resultado,
        rejectionReasonCategory,
      });
      await fetchFunnel();
    } catch (err) {
      console.error('Failed to move encuadre:', err);
    }
  }, [fetchFunnel]);

  return { data, isLoading, error, refetch: fetchFunnel, moveEncuadre };
}
