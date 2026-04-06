/**
 * PublicVacancyController.test.ts
 *
 * Cenários cobertos:
 *   1. 200 — vaga encontrada, retorna apenas campos não-sensíveis
 *   2. 404 — vaga não encontrada (zero rows)
 *   3. 404 — vaga soft-deleted (deleted_at IS NOT NULL) → query filtra, retorna 0 rows
 *   4. 500 — erro de banco de dados
 *   5. Dados sensíveis do paciente ausentes (nome, diagnóstico, insurance não expostos)
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

import { PublicVacancyController } from '../PublicVacancyController';
import { Request, Response } from 'express';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReqRes(params: Record<string, string> = {}): [Request, Response] {
  const req = { params, query: {}, body: {} } as unknown as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return [req, res];
}

const VACANCY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeVacancyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VACANCY_ID,
    case_number: 42,
    title: 'CASO 42',
    status: 'BUSQUEDA',
    dependency_level: 'MODERADA',
    pathology_types: ['TEA'],
    required_professions: ['psicopedagogo'],
    required_sex: null,
    age_range_min: 5,
    age_range_max: 12,
    worker_attributes: null,
    schedule: 'manana',
    schedule_days_hours: null,
    service_device_types: ['domicilio'],
    salary_text: '$1000/h',
    talentum_description: 'Buscamos AT con experiencia en TEA.',
    talentum_whatsapp_url: 'https://wa.me/link',
    country: 'AR',
    created_at: '2025-01-01T00:00:00Z',
    patient_zone: 'Palermo',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PublicVacancyController.getById', () => {
  let controller: PublicVacancyController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PublicVacancyController();
  });

  it('returns 200 with vacancy data when found', async () => {
    const row = makeVacancyRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const [req, res] = mockReqRes({ id: VACANCY_ID });
    await controller.getById(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE jp.id = $1');
    expect(sql).toContain('AND jp.deleted_at IS NULL');
    expect(params).toEqual([VACANCY_ID]);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: row });
  });

  it('returns 404 when vacancy not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const [req, res] = mockReqRes({ id: VACANCY_ID });
    await controller.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Vacancy not found' });
  });

  it('returns 404 for soft-deleted vacancy (query filters deleted_at)', async () => {
    // The WHERE clause includes deleted_at IS NULL, so the DB returns 0 rows
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const [req, res] = mockReqRes({ id: VACANCY_ID });
    await controller.getById(req, res);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('deleted_at IS NULL');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const [req, res] = mockReqRes({ id: VACANCY_ID });
    await controller.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to fetch vacancy' });
  });

  it('does not expose sensitive patient fields', async () => {
    const row = makeVacancyRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const [req, res] = mockReqRes({ id: VACANCY_ID });
    await controller.getById(req, res);

    const [sql] = mockQuery.mock.calls[0];

    // Sensitive fields must not appear in the SELECT
    expect(sql).not.toMatch(/p\.first_name/);
    expect(sql).not.toMatch(/p\.last_name/);
    expect(sql).not.toMatch(/p\.diagnosis/);
    expect(sql).not.toMatch(/p\.insurance/);

    // Only non-sensitive zone field is allowed
    expect(sql).toContain('p.zone_neighborhood AS patient_zone');
  });
});
