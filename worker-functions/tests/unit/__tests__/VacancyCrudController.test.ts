/**
 * VacancyCrudController — Unit Tests
 *
 * Validates: INSERT SQL includes all required columns (description, etc.),
 * correct parameter count, field defaults, allowedFields whitelist,
 * JSONB serialization, and error handling.
 */

// ── Mocks ────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('../../../src/infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({ getPool: () => mockPool }),
  },
}));

jest.mock('../../../src/infrastructure/services/MatchmakingService', () => ({
  MatchmakingService: jest.fn().mockImplementation(() => ({
    matchWorkersForJob: jest.fn().mockResolvedValue({ candidates: [] }),
  })),
}));

jest.mock('../../../src/infrastructure/services/JobPostingEnrichmentService', () => ({
  JobPostingEnrichmentService: jest.fn().mockImplementation(() => ({
    enrichJobPosting: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { VacancyCrudController } from '../../../src/interfaces/controllers/VacancyCrudController';

// Flush setImmediate callbacks from background enrichment/matching
afterEach(() => new Promise(resolve => setImmediate(resolve)));

// ── Helpers ──────────────────────────────────────────────────────────

function mockReq(body: any = {}, params: any = {}): any {
  return { body, params };
}

function mockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const FULL_BODY = {
  case_number: 100,
  title: 'CASO 100',
  patient_id: null,
  required_professions: ['AT', 'CAREGIVER'],
  required_sex: 'F',
  age_range_min: 25,
  age_range_max: 45,
  worker_profile_sought: null,
  required_experience: 'Experiencia en TEA',
  worker_attributes: 'Empatia, compromiso',
  schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '14:00' }],
  work_schedule: 'full-time',
  pathology_types: 'TEA, TLP',
  dependency_level: 'Moderado',
  service_device_types: ['DOMICILIARIO', 'ESCOLAR'],
  providers_needed: 2,
  salary_text: '500 USD',
  payment_day: 'Dia 20',
  daily_obs: 'Nota interna',
  city: 'Palermo',
  state: 'CABA',
};

const VACANCY_ROW = { id: 'uuid-123', ...FULL_BODY, status: 'BUSQUEDA', country: 'AR' };

// ── Tests ────────────────────────────────────────────────────────────

describe('VacancyCrudController', () => {
  let controller: VacancyCrudController;

  beforeEach(() => {
    mockQuery.mockReset();
    controller = new VacancyCrudController();
  });

  // ── createVacancy ────────────────────────────────────────────────

  describe('createVacancy', () => {
    it('INSERT includes description column with empty string default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('description');
      expect(sql).toMatch(/VALUES\s*\(\s*\$1,\s*\$2,\s*'',/);
    });

    it('sends 21 parameters ($1 through $21)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params).toHaveLength(21);
    });

    it('maps all fields to correct parameter positions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[0]).toBe(100);                           // case_number
      expect(params[1]).toBe('CASO 100');                    // title
      expect(params[2]).toBeNull();                          // patient_id
      expect(params[3]).toEqual(['AT', 'CAREGIVER']);        // required_professions
      expect(params[4]).toBe('F');                           // required_sex
      expect(params[5]).toBe(25);                            // age_range_min
      expect(params[6]).toBe(45);                            // age_range_max
      expect(params[7]).toBeNull();                          // worker_profile_sought
      expect(params[8]).toBe('Experiencia en TEA');          // required_experience
      expect(params[9]).toBe('Empatia, compromiso');         // worker_attributes
      expect(params[10]).toContain('"dayOfWeek":1');         // schedule JSON
      expect(params[11]).toBe('full-time');                  // work_schedule
      expect(params[12]).toBe('TEA, TLP');                   // pathology_types
      expect(params[13]).toBe('Moderado');                   // dependency_level
      expect(params[14]).toEqual(['DOMICILIARIO', 'ESCOLAR']); // service_device_types
      expect(params[15]).toBe(2);                            // providers_needed
      expect(params[16]).toBe('500 USD');                    // salary_text
      expect(params[17]).toBe('Dia 20');                     // payment_day
      expect(params[18]).toBe('Nota interna');               // daily_obs
      expect(params[19]).toBe('Palermo');                    // city
      expect(params[20]).toBe('CABA');                       // state
    });

    it('hardcodes status=BUSQUEDA and country=AR in SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("'BUSQUEDA'");
      expect(sql).toContain("'AR'");
    });

    it('serializes schedule as JSON string', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, schedule: [{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }] });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(typeof params[10]).toBe('string');
      expect(JSON.parse(params[10])).toEqual([{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }]);
    });

    it('defaults salary_text to "A convenir" when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, salary_text: undefined });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[16]).toBe('A convenir');
    });

    it('defaults required_professions to empty array when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, required_professions: undefined });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[3]).toEqual([]);
    });

    it('defaults service_device_types to empty array when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, service_device_types: undefined });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[14]).toEqual([]);
    });

    it('generates title from case_number when title is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, title: '' });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[1]).toBe('Caso 100');
    });

    it('sets null for schedule when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq({ ...FULL_BODY, schedule: undefined });
      const res = mockRes();

      await controller.createVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params[10]).toBeNull();
    });

    it('returns 201 with created vacancy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: VACANCY_ROW });
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('column "description" violates not-null'));
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Failed to create vacancy' }),
      );
    });

    it('INSERT column count matches VALUES placeholder count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [VACANCY_ROW] });
      const req = mockReq(FULL_BODY);
      const res = mockRes();

      await controller.createVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      // Extract column names from INSERT INTO ... (columns) VALUES
      const colMatch = sql.match(/INSERT INTO job_postings\s*\(([\s\S]*?)\)\s*VALUES/);
      expect(colMatch).toBeTruthy();
      const columns = colMatch![1].split(',').map(c => c.trim()).filter(Boolean);
      // 21 param columns + description (literal '') + status (literal) + country (literal) = 24
      expect(columns).toHaveLength(24);
    });
  });

  // ── updateVacancy ────────────────────────────────────────────────

  describe('updateVacancy', () => {
    it('accepts all allowed fields', async () => {
      const updates = {
        title: 'CASO 200',
        required_professions: ['NURSE'],
        required_sex: 'M',
        age_range_min: 20,
        age_range_max: 50,
        required_experience: 'x',
        worker_attributes: 'y',
        schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
        work_schedule: 'part-time',
        pathology_types: 'TEA',
        dependency_level: 'Grave',
        service_device_types: ['ESCOLAR'],
        providers_needed: 3,
        salary_text: '1000',
        payment_day: 'Dia 5',
        daily_obs: 'obs',
        city: 'Recoleta',
        state: 'Buenos Aires',
        status: 'CUBIERTO',
        patient_id: 'p-123',
        worker_profile_sought: 'algo',
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-123', ...updates }] });
      const req = mockReq(updates, { id: 'uuid-123' });
      const res = mockRes();

      await controller.updateVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      // All 21 allowed fields should appear in SET clause
      expect(sql).toContain('title =');
      expect(sql).toContain('required_professions =');
      expect(sql).toContain('schedule =');
      expect(sql).toContain('status =');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects unknown fields silently', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-123', title: 'X' }] });
      const req = mockReq({ title: 'X', HACKED_FIELD: 'malicious' }, { id: 'uuid-123' });
      const res = mockRes();

      await controller.updateVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('HACKED_FIELD');
      expect(sql).toContain('title =');
    });

    it('returns 400 when no valid fields provided', async () => {
      const req = mockReq({ unknown_field: 'value' }, { id: 'uuid-123' });
      const res = mockRes();

      await controller.updateVacancy(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('serializes JSONB schedule field', async () => {
      const schedule = [{ dayOfWeek: 5, startTime: '14:00', endTime: '20:00' }];
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-123', schedule }] });
      const req = mockReq({ schedule }, { id: 'uuid-123' });
      const res = mockRes();

      await controller.updateVacancy(req, res);

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(typeof params[0]).toBe('string');
      expect(JSON.parse(params[0])).toEqual(schedule);
    });

    it('returns 404 when vacancy not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = mockReq({ title: 'X' }, { id: 'nonexistent' });
      const res = mockRes();

      await controller.updateVacancy(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── deleteVacancy ────────────────────────────────────────────────

  describe('deleteVacancy', () => {
    it('soft-deletes by setting status=closed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-123' }] });
      const req = mockReq({}, { id: 'uuid-123' });
      const res = mockRes();

      await controller.deleteVacancy(req, res);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'closed'");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when vacancy not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = mockReq({}, { id: 'nonexistent' });
      const res = mockRes();

      await controller.deleteVacancy(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
