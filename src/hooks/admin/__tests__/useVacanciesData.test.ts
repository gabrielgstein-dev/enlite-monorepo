import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVacanciesData } from '../useVacanciesData';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

vi.mock('@infrastructure/http/AdminApiService');

describe('useVacanciesData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch vacancies and stats on mount', async () => {
    const mockVacancies = { data: [{ id: 1 }], total: 1 };
    const mockStats = [{ label: '+7 dias', value: '5' }];

    vi.spyOn(AdminApiService, 'listVacancies').mockResolvedValue(mockVacancies);
    vi.spyOn(AdminApiService, 'getVacanciesStats').mockResolvedValue(mockStats);

    const { result } = renderHook(() => useVacanciesData());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.vacancies).toEqual(mockVacancies.data);
    expect(result.current.stats).toEqual(mockStats);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', async () => {
    const errorMessage = 'Network error';
    vi.spyOn(AdminApiService, 'listVacancies').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useVacanciesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
  });

  it('should refetch when filters change', async () => {
    const mockVacancies = { data: [], total: 0 };
    const mockStats: any[] = [];
    const listSpy = vi.spyOn(AdminApiService, 'listVacancies').mockResolvedValue(mockVacancies);
    vi.spyOn(AdminApiService, 'getVacanciesStats').mockResolvedValue(mockStats);

    const { rerender } = renderHook(
      ({ filters }) => useVacanciesData(filters),
      { initialProps: { filters: { search: 'test1' } } }
    );

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({ search: 'test1' });
    });

    rerender({ filters: { search: 'test2' } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({ search: 'test2' });
    });
  });
});
