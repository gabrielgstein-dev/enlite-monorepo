import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AdminPatientsApiService } from '../AdminPatientsApiService';

vi.mock('@infrastructure/services/FirebaseAuthService', () => ({
  FirebaseAuthService: vi.fn().mockImplementation(() => ({
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

describe('AdminPatientsApiService - Patients Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockFetch(data: unknown[] = [], total = 0) {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data, total }),
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/json' : null),
      },
    });
  }

  function capturedUrl(): string {
    return (global.fetch as Mock).mock.calls[0][0] as string;
  }

  describe('listPatients', () => {
    it('sem filtros chama GET /api/admin/patients', async () => {
      mockFetch();
      const result = await AdminPatientsApiService.listPatients();

      expect(capturedUrl()).toContain('/api/admin/patients');
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('search é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ search: 'Francisco' });

      expect(capturedUrl()).toContain('search=Francisco');
    });

    it('needs_attention=true é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ needs_attention: 'true' });

      expect(capturedUrl()).toContain('needs_attention=true');
    });

    it('needs_attention=false é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ needs_attention: 'false' });

      expect(capturedUrl()).toContain('needs_attention=false');
    });

    it('attention_reason é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ attention_reason: 'MISSING_INFO' });

      expect(capturedUrl()).toContain('attention_reason=MISSING_INFO');
    });

    it('clinical_specialty é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ clinical_specialty: 'ASD' });

      expect(capturedUrl()).toContain('clinical_specialty=ASD');
    });

    it('dependency_level é incluído na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ dependency_level: 'SEVERE' });

      expect(capturedUrl()).toContain('dependency_level=SEVERE');
    });

    it('limit e offset são incluídos na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ limit: '10', offset: '20' });

      const url = capturedUrl();
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
    });

    it('retorna data e total corretamente do JSON de resposta', async () => {
      const patients = [
        { id: 'p1', firstName: 'Francisco', lastName: 'Alomon', needsAttention: false },
      ];
      mockFetch(patients, 303);

      const result = await AdminPatientsApiService.listPatients();

      expect(result.data).toEqual(patients);
      expect(result.total).toBe(303);
    });

    it('lança erro quando API retorna success=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Unauthorized' }),
        status: 401,
        headers: {
          get: (name: string) => (name === 'content-type' ? 'application/json' : null),
        },
      });

      await expect(AdminPatientsApiService.listPatients()).rejects.toThrow('Unauthorized');
    });

    it('filtros combinados são todos incluídos na URL', async () => {
      mockFetch([{ id: 'p1' }], 1);
      await AdminPatientsApiService.listPatients({
        needs_attention: 'true',
        attention_reason: 'MISSING_INFO',
        clinical_specialty: 'ASD',
        dependency_level: 'SEVERE',
        limit: '10',
        offset: '0',
      });

      const url = capturedUrl();
      expect(url).toContain('needs_attention=true');
      expect(url).toContain('attention_reason=MISSING_INFO');
      expect(url).toContain('clinical_specialty=ASD');
      expect(url).toContain('dependency_level=SEVERE');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });

    it('filtros vazios não são incluídos na URL', async () => {
      mockFetch();
      await AdminPatientsApiService.listPatients({ search: '', needs_attention: undefined });

      const url = capturedUrl();
      expect(url).not.toContain('search=');
      expect(url).not.toContain('needs_attention=');
    });
  });

  describe('getPatientStats', () => {
    it('chama GET /api/admin/patients/stats', async () => {
      const statsData = {
        total: 303,
        complete: 133,
        needsAttention: 170,
        createdToday: 0,
        createdYesterday: 0,
        createdLast7Days: 0,
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: statsData }),
        headers: { get: () => null },
      });

      const result = await AdminPatientsApiService.getPatientStats();

      expect(capturedUrl()).toContain('/api/admin/patients/stats');
      expect(result).toEqual(statsData);
    });

    it('retorna todos os campos de PatientStats corretamente', async () => {
      const statsData = {
        total: 100,
        complete: 60,
        needsAttention: 40,
        createdToday: 5,
        createdYesterday: 3,
        createdLast7Days: 20,
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: statsData }),
        headers: { get: () => null },
      });

      const result = await AdminPatientsApiService.getPatientStats();

      expect(result.total).toBe(100);
      expect(result.complete).toBe(60);
      expect(result.needsAttention).toBe(40);
      expect(result.createdToday).toBe(5);
    });

    it('lança erro quando API retorna success=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Forbidden' }),
        headers: { get: () => null },
      });

      await expect(AdminPatientsApiService.getPatientStats()).rejects.toThrow('Forbidden');
    });
  });
});
