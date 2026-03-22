import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

vi.mock('@infrastructure/http/AdminApiService');

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch all dashboard data on mount', async () => {
    const mockClickUp = [{ case_number: 442 }];
    const mockTalentum = [{ id: 1 }];
    const mockProgreso = [{ id: 2 }];
    const mockPublications = [{ channel: 'Facebook' }];
    const mockEncuadres = [{ resultado: 'SELECCIONADO' }];

    vi.spyOn(AdminApiService, 'getClickUpCases').mockResolvedValue(mockClickUp);
    vi.spyOn(AdminApiService, 'getTalentumWorkers').mockResolvedValue(mockTalentum);
    vi.spyOn(AdminApiService, 'getProgresoWorkers').mockResolvedValue(mockProgreso);
    vi.spyOn(AdminApiService, 'getPublications').mockResolvedValue(mockPublications);
    vi.spyOn(AdminApiService, 'getEncuadres').mockResolvedValue(mockEncuadres);

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.clickUpData).toEqual(mockClickUp);
    expect(result.current.talentumData).toEqual(mockTalentum);
    expect(result.current.progresoData).toEqual(mockProgreso);
    expect(result.current.pubData).toEqual(mockPublications);
    expect(result.current.baseData).toEqual(mockEncuadres);
    expect(result.current.error).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    const errorMessage = 'Network error';
    vi.spyOn(AdminApiService, 'getClickUpCases').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
  });

  it('should refetch data when filters change', async () => {
    const mockData = [{ case_number: 442 }];
    const getClickUpSpy = vi.spyOn(AdminApiService, 'getClickUpCases').mockResolvedValue(mockData);
    vi.spyOn(AdminApiService, 'getTalentumWorkers').mockResolvedValue([]);
    vi.spyOn(AdminApiService, 'getProgresoWorkers').mockResolvedValue([]);
    vi.spyOn(AdminApiService, 'getPublications').mockResolvedValue([]);
    vi.spyOn(AdminApiService, 'getEncuadres').mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ filters }) => useDashboardData(filters),
      { initialProps: { filters: { startDate: '2024-01-01' } } }
    );

    await waitFor(() => {
      expect(getClickUpSpy).toHaveBeenCalledWith({ startDate: '2024-01-01' });
    });

    rerender({ filters: { startDate: '2024-02-01' } });

    await waitFor(() => {
      expect(getClickUpSpy).toHaveBeenCalledWith({ startDate: '2024-02-01' });
    });
  });
});
