import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AdminApiService } from '../AdminApiService';

describe('AdminApiService - Workers Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AdminApiService, 'getAuthHeaders' as keyof typeof AdminApiService).mockResolvedValue({
      'Content-Type': 'application/json',
    });
  });

  function mockFetch(data: unknown[] = [], total = 0) {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data, total, limit: 20, offset: 0 }),
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/json' : null),
      },
    });
  }

  function capturedUrl(): string {
    return (global.fetch as Mock).mock.calls[0][0] as string;
  }

  describe('listWorkers', () => {
    it('sem filtros chama GET /api/admin/workers', async () => {
      mockFetch();
      const result = await AdminApiService.listWorkers();

      expect(capturedUrl()).toContain('/api/admin/workers');
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('platform=talentum é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listWorkers({ platform: 'talentum' });

      expect(capturedUrl()).toContain('platform=talentum');
    });

    it('platform=ana_care é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listWorkers({ platform: 'ana_care' });

      expect(capturedUrl()).toContain('platform=ana_care');
    });

    it('docs_complete=complete é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listWorkers({ docs_complete: 'complete' });

      expect(capturedUrl()).toContain('docs_complete=complete');
    });

    it('docs_complete=incomplete é incluído na URL', async () => {
      mockFetch();
      await AdminApiService.listWorkers({ docs_complete: 'incomplete' });

      expect(capturedUrl()).toContain('docs_complete=incomplete');
    });

    it('limit e offset são incluídos na URL', async () => {
      mockFetch();
      await AdminApiService.listWorkers({ limit: '10', offset: '20' });

      const url = capturedUrl();
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
    });

    it('retorna data e total corretamente do JSON de resposta', async () => {
      const workers = [
        { id: 'w1', name: 'João', casesCount: 1, documentsComplete: true, platform: 'talentum' },
      ];
      mockFetch(workers, 42);

      const result = await AdminApiService.listWorkers();

      expect(result.data).toEqual(workers);
      expect(result.total).toBe(42);
    });

    it('lança erro quando API retorna success=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Unauthorized' }),
        status: 401,
        headers: {
          get: (name: string) => (name === 'content-type' ? 'application/json' : null),
        },
      });

      await expect(AdminApiService.listWorkers()).rejects.toThrow('Unauthorized');
    });

    it('filtros combinados são todos incluídos na URL', async () => {
      mockFetch([{ id: 'w1' }], 1);
      await AdminApiService.listWorkers({
        platform: 'planilla_operativa',
        docs_complete: 'incomplete',
        limit: '5',
        offset: '10',
      });

      const url = capturedUrl();
      expect(url).toContain('platform=planilla_operativa');
      expect(url).toContain('docs_complete=incomplete');
      expect(url).toContain('limit=5');
      expect(url).toContain('offset=10');
    });
  });

  describe('getWorkerById', () => {
    it('chama GET /api/admin/workers/:id com o ID correto', async () => {
      const workerData = { id: 'w-123', email: 'ana@test.com', firstName: 'Ana' };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: workerData }),
        headers: { get: () => null },
      });

      const result = await AdminApiService.getWorkerById('w-123');

      expect(capturedUrl()).toContain('/api/admin/workers/w-123');
      expect(result).toEqual(workerData);
    });

    it('retorna todos os campos do WorkerDetail corretamente', async () => {
      const workerDetail = {
        id: 'w-456',
        email: 'maria@test.com',
        phone: '+55 11 99999-0000',
        whatsappPhone: '+55 11 88888-0000',
        country: 'BR',
        timezone: 'America/Sao_Paulo',
        status: 'REGISTERED',
        overallStatus: 'QUALIFIED',
        availabilityStatus: 'available',
        dataSources: ['talentum'],
        platform: 'talentum',
        firstName: 'Maria',
        lastName: 'Santos',
        isMatchable: true,
        isActive: true,
        documents: null,
        serviceAreas: [],
        location: null,
        encuadres: [],
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: workerDetail }),
        headers: { get: () => null },
      });

      const result = await AdminApiService.getWorkerById('w-456');

      expect(result.id).toBe('w-456');
      expect(result.overallStatus).toBe('QUALIFIED');
      expect(result.availabilityStatus).toBe('available');
      expect(result.isMatchable).toBe(true);
    });

    it('lança erro quando API retorna success=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Worker not found' }),
        headers: { get: () => null },
      });

      await expect(AdminApiService.getWorkerById('nonexistent')).rejects.toThrow('Worker not found');
    });

    it('lança erro genérico quando API falha sem mensagem de erro', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false }),
        status: 500,
        headers: { get: () => null },
      });

      await expect(AdminApiService.getWorkerById('w-123')).rejects.toThrow();
    });

    it('envia método GET e headers de autenticação', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: { id: 'w-1' } }),
        headers: { get: () => null },
      });

      await AdminApiService.getWorkerById('w-1');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      expect(fetchCall[1].method).toBe('GET');
      expect(fetchCall[1].headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('getWorkerDateStats', () => {
    it('chama GET /api/admin/workers/stats', async () => {
      const statsData = { today: 5, yesterday: 3, sevenDaysAgo: 8 };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: statsData }),
        headers: { get: () => null },
      });

      const result = await AdminApiService.getWorkerDateStats();

      expect(capturedUrl()).toContain('/api/admin/workers/stats');
      expect(result).toEqual(statsData);
    });

    it('retorna { today, yesterday, sevenDaysAgo } corretamente', async () => {
      const statsData = { today: 10, yesterday: 7, sevenDaysAgo: 25 };
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: statsData }),
        headers: { get: () => null },
      });

      const result = await AdminApiService.getWorkerDateStats();

      expect(result.today).toBe(10);
      expect(result.yesterday).toBe(7);
      expect(result.sevenDaysAgo).toBe(25);
    });

    it('lança erro quando API retorna success=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: 'Forbidden' }),
        headers: { get: () => null },
      });

      await expect(AdminApiService.getWorkerDateStats()).rejects.toThrow('Forbidden');
    });
  });
});
