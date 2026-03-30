import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export interface CoordinatorMetrics {
  id: string;
  name: string;
  weeklyHours: number | null;
  activeCases: number;
  encuadresThisWeek: number;
  conversionRate: number | null;
  totalCases: number;
}

export interface DashboardAlert {
  jobPostingId: string;
  caseNumber: number | null;
  title: string | null;
  coordinatorName: string | null;
  daysOpen: number | null;
  totalEncuadres: number;
  selectedCount: number;
  recentEncuadres: number;
  alertReasons: string[];
}

export interface ChannelConversion {
  channel: string;
  total: number;
  selected: number;
  attended: number;
  conversionRate: number | null;
}

export function useCoordinatorDashboard() {
  const [coordinators, setCoordinators] = useState<CoordinatorMetrics[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [channels, setChannels] = useState<ChannelConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [capResponse, alertResponse, channelResponse] = await Promise.all([
        AdminApiService.getCoordinatorCapacity() as Promise<CoordinatorMetrics[]>,
        AdminApiService.getDashboardAlerts() as Promise<DashboardAlert[]>,
        AdminApiService.getConversionByChannel() as Promise<ChannelConversion[]>,
      ]);
      setCoordinators(capResponse);
      setAlerts(alertResponse);
      setChannels(channelResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { coordinators, alerts, channels, isLoading, error, refetch: fetchData };
}
