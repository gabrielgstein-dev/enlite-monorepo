import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { AdminRecruitmentApiService } from '@infrastructure/http/AdminRecruitmentApiService';

vi.mock('@infrastructure/http/AdminRecruitmentApiService');

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

    vi.spyOn(AdminRecruitmentApiService, 'getClickUpCases').mockResolvedValue(mockClickUp);
    vi.spyOn(AdminRecruitmentApiService, 'getTalentumWorkers').mockResolvedValue(mockTalentum);
    vi.spyOn(AdminRecruitmentApiService, 'getProgresoWorkers').mockResolvedValue(mockProgreso);
    vi.spyOn(AdminRecruitmentApiService, 'getPublications').mockResolvedValue(mockPublications);
    vi.spyOn(AdminRecruitmentApiService, 'getEncuadres').mockResolvedValue(mockEncuadres);

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
    vi.spyOn(AdminRecruitmentApiService, 'getClickUpCases').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
  });

  it('should refetch data when filters change', async () => {
    const mockData = [{ case_number: 442 }];
    const getClickUpSpy = vi.spyOn(AdminRecruitmentApiService, 'getClickUpCases').mockResolvedValue(mockData);
    vi.spyOn(AdminRecruitmentApiService, 'getTalentumWorkers').mockResolvedValue([]);
    vi.spyOn(AdminRecruitmentApiService, 'getProgresoWorkers').mockResolvedValue([]);
    vi.spyOn(AdminRecruitmentApiService, 'getPublications').mockResolvedValue([]);
    vi.spyOn(AdminRecruitmentApiService, 'getEncuadres').mockResolvedValue([]);

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
