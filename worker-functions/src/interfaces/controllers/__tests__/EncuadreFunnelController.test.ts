/**
 * EncuadreFunnelController.test.ts
 *
 * Tests the kanban funnel endpoints and coordinator dashboard.
 *
 * Scenarios:
 * 1. getEncuadreFunnel — groups encuadres by stage correctly
 * 2. moveEncuadre — validates input and delegates to use case
 * 3. getCoordinatorCapacity — returns coordinator metrics
 * 4. getAlerts — returns problem cases with correct alert reasons
 */

const mockQuery = jest.fn();

jest.mock('../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: mockQuery,
      }),
    }),
  },
}));

import { EncuadreFunnelController } from '../EncuadreFunnelController';
import { Request, Response } from 'express';

function mockReqRes(params = {}, body = {}): [Request, Response] {
  const req = { params, body, query: {} } as unknown as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return [req, res];
}

describe('EncuadreFunnelController', () => {
  let controller: EncuadreFunnelController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EncuadreFunnelController();
  });

  describe('getEncuadreFunnel', () => {
    it('groups encuadres into correct funnel stages', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'e1', worker_name: 'Ana', worker_phone: '+54911', occupation_raw: 'AT',
            interview_date: tomorrow, interview_time: '10:00', meet_link: 'https://meet.google.com/abc',
            resultado: null, attended: null, rejection_reason_category: null,
            rejection_reason: null, match_score: 80, work_zone: 'Palermo', redireccionamiento: null,
          },
          {
            id: 'e2', worker_name: 'Bruno', worker_phone: '+54922', occupation_raw: 'AT',
            interview_date: today, interview_time: '14:00', meet_link: 'https://meet.google.com/def',
            resultado: null, attended: null, rejection_reason_category: null,
            rejection_reason: null, match_score: 65, work_zone: 'Belgrano', redireccionamiento: null,
          },
          {
            id: 'e3', worker_name: 'Clara', worker_phone: '+54933', occupation_raw: 'NURSE',
            interview_date: '2025-01-01', interview_time: '09:00', meet_link: null,
            resultado: 'SELECCIONADO', attended: true, rejection_reason_category: null,
            rejection_reason: null, match_score: 90, work_zone: 'Recoleta', redireccionamiento: null,
          },
          {
            id: 'e4', worker_name: 'Diego', worker_phone: '+54944', occupation_raw: 'AT',
            interview_date: '2025-02-01', interview_time: null, meet_link: null,
            resultado: 'RECHAZADO', attended: true, rejection_reason_category: 'DISTANCE',
            rejection_reason: 'Too far', match_score: 40, work_zone: null, redireccionamiento: null,
          },
          {
            id: 'e5', worker_name: 'Elena', worker_phone: '+54955', occupation_raw: 'AT',
            interview_date: null, interview_time: null, meet_link: null,
            resultado: 'PENDIENTE', attended: null, rejection_reason_category: null,
            rejection_reason: null, match_score: null, work_zone: null, redireccionamiento: null,
          },
        ],
      });

      const [req, res] = mockReqRes({ id: 'jp-001' });
      await controller.getEncuadreFunnel(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalEncuadres: 5,
            stages: expect.objectContaining({
              CONFIRMED: expect.arrayContaining([
                expect.objectContaining({ id: 'e1', workerName: 'Ana' }),
              ]),
              INTERVIEWING: expect.arrayContaining([
                expect.objectContaining({ id: 'e2', workerName: 'Bruno' }),
              ]),
              SELECTED: expect.arrayContaining([
                expect.objectContaining({ id: 'e3', workerName: 'Clara' }),
              ]),
              REJECTED: expect.arrayContaining([
                expect.objectContaining({ id: 'e4', rejectionReasonCategory: 'DISTANCE' }),
              ]),
              PENDING: expect.arrayContaining([
                expect.objectContaining({ id: 'e5' }),
              ]),
            }),
          }),
        })
      );
    });

    it('returns empty stages when no encuadres exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const [req, res] = mockReqRes({ id: 'jp-empty' });
      await controller.getEncuadreFunnel(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.totalEncuadres).toBe(0);
      Object.values(response.data.stages).forEach((stage: any) => {
        expect(stage).toHaveLength(0);
      });
    });
  });

  describe('moveEncuadre', () => {
    it('returns 400 when resultado is missing', async () => {
      const [req, res] = mockReqRes({ id: 'e1' }, {});
      await controller.moveEncuadre(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'resultado is required' })
      );
    });

    it('delegates to UpdateEncuadreResultUseCase', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ worker_id: 'w1', job_posting_id: 'jp1' }],
      }).mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const [req, res] = mockReqRes(
        { id: 'e1' },
        { resultado: 'RECHAZADO', rejectionReasonCategory: 'SCHEDULE_INCOMPATIBLE' }
      );
      await controller.moveEncuadre(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getCoordinatorCapacity', () => {
    it('returns coordinator metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1', name: 'Maria', weekly_hours: '20.00',
            active_cases: 3, encuadres_this_week: 12,
            conversion_rate: '0.25', total_cases: 8,
          },
          {
            id: 'c2', name: 'Juan', weekly_hours: null,
            active_cases: 1, encuadres_this_week: 5,
            conversion_rate: null, total_cases: 3,
          },
        ],
      });

      const [req, res] = mockReqRes();
      await controller.getCoordinatorCapacity(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.data[0]).toEqual({
        id: 'c1', name: 'Maria', weeklyHours: 20,
        activeCases: 3, encuadresThisWeek: 12,
        conversionRate: 0.25, totalCases: 8,
      });
      expect(response.data[1].weeklyHours).toBeNull();
      expect(response.data[1].conversionRate).toBeNull();
    });
  });

  describe('getAlerts', () => {
    it('returns alerts with correct reasons', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'jp1', case_number: 100, title: 'Caso 100',
            coordinator_name: 'Maria', search_start_date: '2024-01-01',
            is_covered: false, days_open: 450,
            total_encuadres: 250, selected_count: 0, recent_encuadres: 0,
          },
        ],
      });

      const [req, res] = mockReqRes();
      await controller.getAlerts(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].alertReasons).toContain('MORE_THAN_200_ENCUADRES');
      expect(response.data[0].alertReasons).toContain('OPEN_MORE_THAN_30_DAYS');
      expect(response.data[0].alertReasons).toContain('NO_CANDIDATES_LAST_7_DAYS');
    });

    it('returns empty array when no alerts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const [req, res] = mockReqRes();
      await controller.getAlerts(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(0);
    });
  });
});
