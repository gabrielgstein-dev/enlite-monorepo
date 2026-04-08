import { useState, useEffect } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export interface CaseOption {
  value: string;
  label: string;
}

export function useCaseOptions() {
  const [options, setOptions] = useState<CaseOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AdminApiService.listCaseOptions()
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
  }, []);

  return { options, isLoading };
}
