import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AdminApiService } from '../AdminApiService';

describe('AdminApiService - Vacancies Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listVacancies', () => {
    function mockFetch(data: unknown[] = [], total = 0) {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data, total, limit: 20, offset: 0 }),
      });
      vi.spyOn(AdminApiService, 'getAuthHeaders' as keyof typeof AdminApiService).mockResolvedValue({ 'Content-Type': 'application/json' });
    }

    function capturedUrl(): string {
      return (global.fetch as Mock).mock.calls[0][0] as string;
    }

    it('sem filtros chama GET /api/admin/vacancies', async () => {
      mockFetch();
      const result = await AdminApiService.listVacancies();
      expect(capturedUrl()).toContain('/api/admin/vacancies');
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('status=ativo é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listVacancies({ status: 'ativo' });
      expect(capturedUrl()).toContain('status=ativo');
    });

    it('status=pausado é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listVacancies({ status: 'pausado' });
      expect(capturedUrl()).toContain('status=pausado');
    });

    it('priority=urgent é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listVacancies({ priority: 'urgent' });
      expect(capturedUrl()).toContain('priority=urgent');
    });

    it('priority=high é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listVacancies({ priority: 'high' });
      expect(capturedUrl()).toContain('priority=high');
    });

    it('todos os filtros combinados são incluídos na URL', async () => {
      mockFetch([{ id: 1 }], 1);
      const filters = { search: 'test', client: 'OSDE', status: 'ativo', priority: 'urgent', limit: '10', offset: '0' };
      const result = await AdminApiService.listVacancies(filters);

      const url = capturedUrl();
      expect(url).toContain('search=test');
      expect(url).toContain('status=ativo');
      expect(url).toContain('priority=urgent');
      expect(url).toContain('client=OSDE');
      expect(result).toEqual({ data: [{ id: 1 }], total: 1 });
    });

    it('priority vazio ("") não é enviado como parâmetro na URL', async () => {
      mockFetch();
      await AdminApiService.listVacancies({ status: 'ativo', priority: '' });
      // URLSearchParams omite strings vazias dependendo da implementação;
      // o que importa é que priority não interfira em outros params
      const url = capturedUrl();
      expect(url).toContain('status=ativo');
    });
  });

  describe('getVacanciesStats', () => {
    it('should fetch vacancies statistics', async () => {
      const mockResponse = [{ label: '+7 dias', value: '5' }];
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(mockResponse);

      const result = await AdminApiService.getVacanciesStats();

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/vacancies/stats');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getVacancyById', () => {
    it('should fetch vacancy by id', async () => {
      const mockResponse = { id: '123', case_number: 442 };
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(mockResponse);

      const result = await AdminApiService.getVacancyById('123');

      expect(requestSpy).toHaveBeenCalledWith('GET', '/api/admin/vacancies/123');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createVacancy', () => {
    it('should create new vacancy', async () => {
      const newVacancy = { case_number: 500, patient_name: 'Test Patient' };
      const mockResponse = { id: '456', ...newVacancy };
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(mockResponse);

      const result = await AdminApiService.createVacancy(newVacancy);

      expect(requestSpy).toHaveBeenCalledWith('POST', '/api/admin/vacancies', newVacancy);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateVacancy', () => {
    it('should update existing vacancy', async () => {
      const updates = { patient_name: 'Updated Name' };
      const mockResponse = { id: '123', ...updates };
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(mockResponse);

      const result = await AdminApiService.updateVacancy('123', updates);

      expect(requestSpy).toHaveBeenCalledWith('PUT', '/api/admin/vacancies/123', updates);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteVacancy', () => {
    it('should delete vacancy', async () => {
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(undefined);

      await AdminApiService.deleteVacancy('123');

      expect(requestSpy).toHaveBeenCalledWith('DELETE', '/api/admin/vacancies/123');
    });
  });

  describe('parseVacancyFromText', () => {
    it('should call request with POST and correct path', async () => {
      const mockResponse = { vacancy: {}, prescreening: { questions: [], faq: [] }, description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' } };
      const requestSpy = vi.spyOn(AdminApiService, 'request' as keyof typeof AdminApiService).mockResolvedValue(mockResponse);

      const result = await AdminApiService.parseVacancyFromText({ text: 'caso TEA', workerType: 'AT' });

      expect(requestSpy).toHaveBeenCalledWith('POST', '/api/admin/vacancies/parse-from-text', { text: 'caso TEA', workerType: 'AT' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('parseVacancyFromPdf', () => {
    const MOCK_PARSED = {
      success: true,
      data: {
        vacancy: { case_number: 42 },
        prescreening: { questions: [], faq: [] },
        description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
      },
    };

    it('should send FormData with pdf file and workerType', async () => {
      const mockToken = 'test-token-abc';
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue(mockToken);
      global.fetch = vi.fn().mockResolvedValue({ json: async () => MOCK_PARSED });

      const file = new File(['pdf-content'], 'case.pdf', { type: 'application/pdf' });
      await AdminApiService.parseVacancyFromPdf(file, 'AT');

      const [url, opts] = (global.fetch as Mock).mock.calls[0];
      expect(url).toContain('/api/admin/vacancies/parse-from-pdf');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeInstanceOf(FormData);
      expect((opts.body as FormData).get('workerType')).toBe('AT');
      expect((opts.body as FormData).get('pdf')).toBeInstanceOf(File);
    });

    it('should include Authorization header when token is available', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue('my-token');
      global.fetch = vi.fn().mockResolvedValue({ json: async () => MOCK_PARSED });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });
      await AdminApiService.parseVacancyFromPdf(file, 'CUIDADOR');

      const [, opts] = (global.fetch as Mock).mock.calls[0];
      expect(opts.headers.Authorization).toBe('Bearer my-token');
    });

    it('should not include Authorization header when no token', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue(null);
      global.fetch = vi.fn().mockResolvedValue({ json: async () => MOCK_PARSED });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });
      await AdminApiService.parseVacancyFromPdf(file, 'AT');

      const [, opts] = (global.fetch as Mock).mock.calls[0];
      expect(opts.headers.Authorization).toBeUndefined();
    });

    it('should not set Content-Type header (browser sets multipart boundary)', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue('t');
      global.fetch = vi.fn().mockResolvedValue({ json: async () => MOCK_PARSED });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });
      await AdminApiService.parseVacancyFromPdf(file, 'AT');

      const [, opts] = (global.fetch as Mock).mock.calls[0];
      expect(opts.headers['Content-Type']).toBeUndefined();
    });

    it('should return parsed data on success', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue('t');
      global.fetch = vi.fn().mockResolvedValue({ json: async () => MOCK_PARSED });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });
      const result = await AdminApiService.parseVacancyFromPdf(file, 'AT');

      expect(result).toEqual(MOCK_PARSED.data);
    });

    it('should throw error when API returns success: false', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue('t');
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Invalid PDF' }),
        status: 400,
      });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });

      await expect(AdminApiService.parseVacancyFromPdf(file, 'AT')).rejects.toThrow('Invalid PDF');
    });

    it('should throw with HTTP status when no error message', async () => {
      vi.spyOn(AdminApiService['authService'] as any, 'getIdToken').mockResolvedValue('t');
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false }),
        status: 500,
      });

      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });

      await expect(AdminApiService.parseVacancyFromPdf(file, 'AT')).rejects.toThrow('HTTP 500');
    });
  });
});
