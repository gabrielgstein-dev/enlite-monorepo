import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCaseAnalysis } from '../useCaseAnalysis';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

vi.mock('@infrastructure/http/AdminApiService');

describe('useCaseAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not fetch when caseNumber is null', () => {
    const getCaseSpy = vi.spyOn(AdminApiService, 'getCaseAnalysis');
    const { result } = renderHook(() => useCaseAnalysis(null));

    expect(result.current.caseData).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getCaseSpy).not.toHaveBeenCalled();
  });

  it('should fetch case analysis when caseNumber is provided', async () => {
    const mockData = { caseInfo: {}, metrics: {} };
    vi.spyOn(AdminApiService, 'getCaseAnalysis').mockResolvedValue(mockData);

    const { result } = renderHook(() => useCaseAnalysis('442'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.caseData).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', async () => {
    const errorMessage = 'Case not found';
    vi.spyOn(AdminApiService, 'getCaseAnalysis').mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useCaseAnalysis('999'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.caseData).toBeNull();
  });

  it('should refetch when caseNumber changes', async () => {
    const mockData1 = { caseInfo: { case_number: 442 } };
    const mockData2 = { caseInfo: { case_number: 443 } };
    const getCaseSpy = vi.spyOn(AdminApiService, 'getCaseAnalysis')
      .mockResolvedValueOnce(mockData1)
      .mockResolvedValueOnce(mockData2);

    const { rerender, result } = renderHook(
      ({ caseNumber }) => useCaseAnalysis(caseNumber),
      { initialProps: { caseNumber: '442' } }
    );

    await waitFor(() => {
      expect(result.current.caseData).toEqual(mockData1);
    });

    rerender({ caseNumber: '443' });

    await waitFor(() => {
      expect(result.current.caseData).toEqual(mockData2);
    });

    expect(getCaseSpy).toHaveBeenCalledTimes(2);
  });
});
