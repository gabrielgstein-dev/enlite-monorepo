import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export function useCaseAnalysis(caseNumber: string | null) {
  const [caseData, setCaseData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseNumber) {
      setCaseData(null);
      return;
    }

    async function fetchCaseAnalysis(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        const result = await AdminApiService.getCaseAnalysis(caseNumber!);
        setCaseData(result);
      } catch (err: any) {
        console.error('[useCaseAnalysis] Error:', err);
        setError(err.message || 'Failed to fetch case analysis');
        setCaseData(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCaseAnalysis();
  }, [caseNumber]);

  return {
    caseData,
    isLoading,
    error
  };
}
