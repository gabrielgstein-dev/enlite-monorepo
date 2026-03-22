import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useZoneAnalysis } from '../useZoneAnalysis';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

vi.mock('@infrastructure/http/AdminApiService');

describe('useZoneAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch zone analysis on mount', async () => {
    const mockData = {
      zones: [
        { zone: 'Palermo', caseCount: 10, percentage: '20' },
        { zone: 'Belgrano', caseCount: 8, percentage: '16' }
      ],
      totalCases: 50,
      nullCount: 5,
      identifiedZones: 2
    };

    vi.spyOn(AdminApiService, 'getZoneAnalysis').mockResolvedValue(mockData);

    const { result } = renderHook(() => useZoneAnalysis());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.zoneData).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', async () => {
    const errorMessage = 'Failed to fetch zones';
    vi.spyOn(AdminApiService, 'getZoneAnalysis').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useZoneAnalysis());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.zoneData).toBeNull();
  });
});
