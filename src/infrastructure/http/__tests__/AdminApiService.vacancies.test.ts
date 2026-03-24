import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminApiService } from '../AdminApiService';

describe('AdminApiService - Vacancies Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listVacancies', () => {
    it('should list vacancies without filters', async () => {
      const mockApiResponse = { success: true, data: [], total: 0, limit: 20, offset: 0 };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => mockApiResponse,
      });
      vi.spyOn(AdminApiService as any, 'getAuthHeaders').mockResolvedValue({ 'Content-Type': 'application/json' });

      const result = await AdminApiService.listVacancies();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/vacancies'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('should list vacancies with all filters', async () => {
      const mockApiResponse = { success: true, data: [{ id: 1 }], total: 1, limit: 10, offset: 0 };
      const filters = { search: 'test', client: 'OSDE', status: 'ativo', limit: '10', offset: '0' };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => mockApiResponse,
      });
      vi.spyOn(AdminApiService as any, 'getAuthHeaders').mockResolvedValue({ 'Content-Type': 'application/json' });

      const result = await AdminApiService.listVacancies(filters);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ data: [{ id: 1 }], total: 1 });
    });
  });

  describe('getVacanciesStats', () => {
    it('should fetch vacancies statistics', async () => {
      const mockResponse = [{ label: '+7 dias', value: '5' }];
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getVacanciesStats();

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/vacancies/stats');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getVacancyById', () => {
    it('should fetch vacancy by id', async () => {
      const mockResponse = { id: '123', case_number: 442 };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.getVacancyById('123');

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/vacancies/123');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createVacancy', () => {
    it('should create new vacancy', async () => {
      const newVacancy = { case_number: 500, patient_name: 'Test Patient' };
      const mockResponse = { id: '456', ...newVacancy };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.createVacancy(newVacancy);

      expect(requestSpy).toHaveBeenCalledWith('POST', '/api/admin/vacancies', newVacancy);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateVacancy', () => {
    it('should update existing vacancy', async () => {
      const updates = { patient_name: 'Updated Name' };
      const mockResponse = { id: '123', ...updates };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.updateVacancy('123', updates);

      expect(requestSpy).toHaveBeenCalledWith('PUT', '/api/admin/vacancies/123', updates);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteVacancy', () => {
    it('should delete vacancy', async () => {
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(undefined);

      await AdminApiService.deleteVacancy('123');

      expect(requestSpy).toHaveBeenCalledWith('DELETE', '/api/admin/vacancies/123');
    });
  });
});
