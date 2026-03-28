import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { MessageStats } from '../../types/messaging';

export function useMessageStats() {
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await AdminApiService.getMessageStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar estatísticas de mensagens');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}
