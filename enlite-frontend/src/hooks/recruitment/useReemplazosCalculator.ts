import { useState } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export interface ReemplazoData {
  caseNumber: number;
  sel: number;
  rem: number;
  total: number;
  color: 'red' | 'yellow' | 'green';
  lastPubDate: string | null;
  lastPubChannel: string | null;
}

export function useReemplazosCalculator() {
  const [reemplazos, setReemplazos] = useState<Record<string, ReemplazoData>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateReemplazos = async (): Promise<void> => {
    try {
      setIsCalculating(true);
      setError(null);

      const result = await AdminApiService.calculateReemplazos();

      const reemplazosMap: Record<string, ReemplazoData> = {};
      result.forEach((item: ReemplazoData) => {
        reemplazosMap[item.caseNumber.toString()] = item;
      });

      setReemplazos(reemplazosMap);
      setHasCalculated(true);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate reemplazos');
    } finally {
      setIsCalculating(false);
    }
  };

  const getColorForCase = (caseNumber: string): 'red' | 'yellow' | 'green' | null => {
    return reemplazos[caseNumber]?.color || null;
  };

  const getDataForCase = (caseNumber: string): ReemplazoData | null => {
    return reemplazos[caseNumber] || null;
  };

  return {
    reemplazos,
    isCalculating,
    hasCalculated,
    error,
    calculateReemplazos,
    getColorForCase,
    getDataForCase
  };
}
