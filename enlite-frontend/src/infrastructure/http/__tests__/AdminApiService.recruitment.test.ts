import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminRecruitmentApiService } from '../AdminRecruitmentApiService';

vi.mock('@infrastructure/services/FirebaseAuthService', () => ({
  FirebaseAuthService: vi.fn().mockImplementation(() => ({
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

function mockFetch(data: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    json: () => Promise.resolve({ success: true, data }),
    headers: { get: () => 'application/json' },
  } as any);
}

describe('AdminRecruitmentApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClickUpCases', () => {
    it('should fetch ClickUp cases without filters', async () => {
      const mockResponse = [{ case_number: 442, status: 'BUSQUEDA' }];
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getClickUpCases();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/clickup-cases'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch ClickUp cases with filters', async () => {
      mockFetch([{ case_number: 442 }]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await AdminRecruitmentApiService.getClickUpCases({
        startDate: '2024-01-01', endDate: '2024-12-31', status: 'BUSQUEDA',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2024-01-01'),
        expect.any(Object)
      );
    });
  });

  describe('getTalentumWorkers', () => {
    it('should fetch Talentum workers', async () => {
      const mockResponse = [{ id: 1, first_name: 'Juan' }];
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getTalentumWorkers();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/talentum-workers'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProgresoWorkers', () => {
    it('should fetch progreso workers', async () => {
      const mockResponse = [{ id: 1, funnel_stage: 'PRE_TALENTUM' }];
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getProgresoWorkers();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/progreso'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getPublications', () => {
    it('should fetch publications with case filter', async () => {
      mockFetch([{ channel: 'Facebook', case_number: 442 }]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await AdminRecruitmentApiService.getPublications({ caseNumber: '442' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('caseNumber=442'),
        expect.any(Object)
      );
    });
  });

  describe('getEncuadres', () => {
    it('should fetch encuadres with resultado filter', async () => {
      mockFetch([{ resultado: 'SELECCIONADO' }]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await AdminRecruitmentApiService.getEncuadres({ resultado: 'SELECCIONADO' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('resultado=SELECCIONADO'),
        expect.any(Object)
      );
    });
  });

  describe('getGlobalMetrics', () => {
    it('should fetch global metrics', async () => {
      const mockResponse = { activeCasesCount: 10, postuladosInTalentumCount: 50 };
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getGlobalMetrics();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/global-metrics'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getCaseAnalysis', () => {
    it('should fetch case analysis for specific case', async () => {
      const mockResponse = { caseInfo: {}, metrics: {} };
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getCaseAnalysis('442');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/case/442'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getZoneAnalysis', () => {
    it('should fetch zone analysis', async () => {
      const mockResponse = { zones: [], totalCases: 100 };
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.getZoneAnalysis();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/zones'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('calculateReemplazos', () => {
    it('should calculate reemplazos', async () => {
      const mockResponse = [{ caseNumber: 442, sel: 2, rem: 3, color: 'yellow' }];
      const fetchSpy = mockFetch(mockResponse);

      const result = await AdminRecruitmentApiService.calculateReemplazos();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/recruitment/calculate-reemplazos'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
