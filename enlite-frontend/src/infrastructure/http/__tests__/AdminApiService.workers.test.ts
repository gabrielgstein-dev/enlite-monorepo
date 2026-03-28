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
