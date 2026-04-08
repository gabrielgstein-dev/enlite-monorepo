import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReemplazosCalculator } from '../useReemplazosCalculator';
import { AdminRecruitmentApiService } from '@infrastructure/http/AdminRecruitmentApiService';

vi.mock('@infrastructure/http/AdminRecruitmentApiService');

describe('useReemplazosCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useReemplazosCalculator());

    expect(result.current.reemplazos).toEqual({});
    expect(result.current.isCalculating).toBe(false);
    expect(result.current.hasCalculated).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should calculate reemplazos successfully', async () => {
    const mockData = [
      { caseNumber: 442, sel: 2, rem: 3, total: 5, color: 'yellow' as const },
      { caseNumber: 443, sel: 5, rem: 6, total: 11, color: 'green' as const }
    ];

    vi.spyOn(AdminRecruitmentApiService, 'calculateReemplazos').mockResolvedValue(mockData);

    const { result } = renderHook(() => useReemplazosCalculator());

    await act(async () => {
      await result.current.calculateReemplazos();
    });

    await waitFor(() => {
      expect(result.current.hasCalculated).toBe(true);
    });

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.reemplazos['442']).toEqual(mockData[0]);
    expect(result.current.reemplazos['443']).toEqual(mockData[1]);
  });

  it('should get color for case correctly', async () => {
    const mockData = [
      { caseNumber: 442, sel: 0, rem: 0, total: 0, color: 'red' as const },
      { caseNumber: 443, sel: 2, rem: 3, total: 5, color: 'yellow' as const },
      { caseNumber: 444, sel: 5, rem: 6, total: 11, color: 'green' as const }
    ];

    vi.spyOn(AdminRecruitmentApiService, 'calculateReemplazos').mockResolvedValue(mockData);

    const { result } = renderHook(() => useReemplazosCalculator());

    await act(async () => {
      await result.current.calculateReemplazos();
    });

    expect(result.current.getColorForCase('442')).toBe('red');
    expect(result.current.getColorForCase('443')).toBe('yellow');
    expect(result.current.getColorForCase('444')).toBe('green');
    expect(result.current.getColorForCase('999')).toBeNull();
  });

  it('should handle errors', async () => {
    const errorMessage = 'Failed to calculate';
    vi.spyOn(AdminRecruitmentApiService, 'calculateReemplazos').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useReemplazosCalculator());

    await act(async () => {
      await result.current.calculateReemplazos();
    });

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.hasCalculated).toBe(false);
  });
});
