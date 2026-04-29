import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AdminApiService } from '../AdminApiService';

// ── Mock AdminVacancyParseApiService ────────────────────────────────────────
// parseVacancyFromText, parseVacancyFromPdf, parseVacancyFull and
// createPatientAddress are delegated to this service. We mock the whole
// module so the delegation works without a real Firebase instance.

const mockParseFromText = vi.fn();
const mockParseFromPdf = vi.fn();
const mockParseVacancyFull = vi.fn();
const mockCreatePatientAddress = vi.fn();

vi.mock('../AdminVacancyParseApiService', () => ({
  AdminVacancyParseApiService: {
    parseVacancyFromText: (...args: any[]) => mockParseFromText(...args),
    parseVacancyFromPdf: (...args: any[]) => mockParseFromPdf(...args),
    parseVacancyFull: (...args: any[]) => mockParseVacancyFull(...args),
    createPatientAddress: (...args: any[]) => mockCreatePatientAddress(...args),
  },
}));

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

  // ── Delegated parse methods ────────────────────────────────────────────────
  // AdminApiService delegates to AdminVacancyParseApiService. Tests verify
  // that the delegation passes arguments through correctly.

  describe('parseVacancyFromText (delegated)', () => {
    it('delegates to AdminVacancyParseApiService.parseVacancyFromText', async () => {
      const mockResponse = {
        vacancy: {}, prescreening: { questions: [], faq: [] },
        description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
      };
      mockParseFromText.mockResolvedValueOnce(mockResponse);

      const result = await AdminApiService.parseVacancyFromText({ text: 'caso TEA', workerType: 'AT' });

      expect(mockParseFromText).toHaveBeenCalledWith({ text: 'caso TEA', workerType: 'AT' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('parseVacancyFromPdf (delegated)', () => {
    const MOCK_PARSED = {
      vacancy: { case_number: 42 },
      prescreening: { questions: [], faq: [] },
      description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
    };

    it('delegates to AdminVacancyParseApiService.parseVacancyFromPdf', async () => {
      mockParseFromPdf.mockResolvedValueOnce(MOCK_PARSED);
      const file = new File(['pdf-content'], 'case.pdf', { type: 'application/pdf' });

      const result = await AdminApiService.parseVacancyFromPdf(file, 'AT');

      expect(mockParseFromPdf).toHaveBeenCalledWith(file, 'AT');
      expect(result).toEqual(MOCK_PARSED);
    });

    it('passes CUIDADOR worker type', async () => {
      mockParseFromPdf.mockResolvedValueOnce(MOCK_PARSED);
      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });

      await AdminApiService.parseVacancyFromPdf(file, 'CUIDADOR');

      expect(mockParseFromPdf).toHaveBeenCalledWith(file, 'CUIDADOR');
    });

    it('propagates errors from the delegate', async () => {
      mockParseFromPdf.mockRejectedValueOnce(new Error('Invalid PDF'));
      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });

      await expect(AdminApiService.parseVacancyFromPdf(file, 'AT')).rejects.toThrow('Invalid PDF');
    });
  });

  describe('parseVacancyFull (delegated)', () => {
    it('delegates to AdminVacancyParseApiService.parseVacancyFull', async () => {
      const mockFull = {
        parsed: {
          vacancy: { case_number: 7 },
          prescreening: { questions: [], faq: [] },
          description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
        },
        addressMatches: [{ patient_address_id: 'addr-1', addressFormatted: 'Av. X 100', confidence: 1, matchType: 'EXACT' as const }],
        fieldClashes: [],
        patientId: 'pat-1',
      };
      mockParseVacancyFull.mockResolvedValueOnce(mockFull);
      const file = new File(['pdf'], 'f.pdf', { type: 'application/pdf' });

      const result = await AdminApiService.parseVacancyFull(file, 'AT');

      expect(mockParseVacancyFull).toHaveBeenCalledWith(file, 'AT');
      expect(result).toEqual(mockFull);
    });
  });

  describe('createPatientAddress (delegated)', () => {
    it('delegates to AdminVacancyParseApiService.createPatientAddress', async () => {
      const mockRow = { id: 'addr-new', patient_id: 'pat-1', address_formatted: 'Av. Y 200' };
      mockCreatePatientAddress.mockResolvedValueOnce(mockRow);

      const result = await AdminApiService.createPatientAddress('pat-1', {
        address_formatted: 'Av. Y 200',
        address_type: 'primary',
      });

      expect(mockCreatePatientAddress).toHaveBeenCalledWith('pat-1', {
        address_formatted: 'Av. Y 200',
        address_type: 'primary',
      });
      expect(result).toEqual(mockRow);
    });
  });
});
