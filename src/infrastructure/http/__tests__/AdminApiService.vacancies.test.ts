import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminApiService } from '../AdminApiService';

describe('AdminApiService - Vacancies Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listVacancies', () => {
    it('should list vacancies without filters', async () => {
      const mockResponse = { data: [], total: 0 };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      const result = await AdminApiService.listVacancies();

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/admin/vacancies'));
      expect(result).toEqual(mockResponse);
    });

    it('should list vacancies with all filters', async () => {
      const mockResponse = { data: [{ id: 1 }], total: 1 };
      const filters = { search: 'test', client: 'OSDE', status: 'ativo', limit: '10', offset: '0' };
      const requestSpy = vi.spyOn(AdminApiService as any, 'request').mockResolvedValue(mockResponse);

      await AdminApiService.listVacancies(filters);

      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('search=test'));
      expect(requestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('status=ativo'));
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
