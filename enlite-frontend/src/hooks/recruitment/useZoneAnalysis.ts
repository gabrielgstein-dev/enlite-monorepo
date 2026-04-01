import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export function useZoneAnalysis() {
  const [zoneData, setZoneData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchZoneAnalysis(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const result = await AdminApiService.getZoneAnalysis();
        setZoneData(result);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch zone analysis');
      } finally {
        setIsLoading(false);
      }
    }

    fetchZoneAnalysis();
  }, []);

  return {
    zoneData,
    isLoading,
    error
  };
}
