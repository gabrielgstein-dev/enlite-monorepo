import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminApiService } from '../AdminApiService';

describe('AdminApiService - Recruitment Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClickUpCases', () => {
    it('should fetch ClickUp cases without filters', async () => {
      const mockResponse = [{ case_number: 442, status: 'BUSQUEDA' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getClickUpCases();

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/admin/recruitment/clickup-cases'));
      expect(result).toEqual(mockResponse);
    });

    it('should fetch ClickUp cases with filters', async () => {
      const mockResponse = [{ case_number: 442 }];
      const filters = { startDate: '2024-01-01', endDate: '2024-12-31', status: 'BUSQUEDA' };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      await AdminApiService.getClickUpCases(filters);

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('startDate=2024-01-01'));
    });
  });

  describe('getTalentumWorkers', () => {
    it('should fetch Talentum workers', async () => {
      const mockResponse = [{ id: 1, first_name: 'Juan' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getTalentumWorkers();

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/admin/recruitment/talentum-workers'));
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProgresoWorkers', () => {
    it('should fetch progreso workers', async () => {
      const mockResponse = [{ id: 1, funnel_stage: 'PRE_TALENTUM' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getProgresoWorkers();

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/admin/recruitment/progreso'));
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getPublications', () => {
    it('should fetch publications with case filter', async () => {
      const mockResponse = [{ channel: 'Facebook', case_number: 442 }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      await AdminApiService.getPublications({ caseNumber: '442' });

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('caseNumber=442'));
    });
  });

  describe('getEncuadres', () => {
    it('should fetch encuadres with resultado filter', async () => {
      const mockResponse = [{ resultado: 'SELECCIONADO' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      await AdminApiService.getEncuadres({ resultado: 'SELECCIONADO' });

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('resultado=SELECCIONADO'));
    });
  });

  describe('getGlobalMetrics', () => {
    it('should fetch global metrics', async () => {
      const mockResponse = { activeCasesCount: 10, postuladosInTalentumCount: 50 };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getGlobalMetrics();

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/admin/recruitment/global-metrics'));
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getCaseAnalysis', () => {
    it('should fetch case analysis for specific case', async () => {
      const mockResponse = { caseInfo: {}, metrics: {} };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getCaseAnalysis('442');

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/recruitment/case/442');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getZoneAnalysis', () => {
    it('should fetch zone analysis', async () => {
      const mockResponse = { zones: [], totalCases: 100 };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getZoneAnalysis();

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/recruitment/zones');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('calculateReemplazos', () => {
    it('should calculate reemplazos', async () => {
      const mockResponse = [{ caseNumber: 442, sel: 2, rem: 3, color: 'yellow' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.calculateReemplazos();

      expect(requestSpy).toHaveBeenCalledWith('POST', '/api/admin/recruitment/calculate-reemplazos');
      expect(result).toEqual(mockResponse);
    });
  });
});
