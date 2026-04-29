/**
 * VacancyAddressReviewController — Unit Tests
 *
 * Covers:
 *   - resolve with existing patient_address_id → 200
 *   - resolve with createAddress → creates address + 200
 *   - patient_address_id does not belong to vacancy patient → 422
 *   - vacancy not found → 404
 *   - vacancy has no patient_id → safe response
 *   - invalid body → 400
 *   - DB error → 500
 */

// ── Mocks ────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({ getPool: () => mockPool }),
  },
}));

import { VacancyAddressReviewController } from '../../../src/modules/matching/interfaces/controllers/VacancyAddressReviewController';

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

const VACANCY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PATIENT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const ADDRESS_ID = 'cccccccc-0000-0000-0000-000000000003';
const NEW_ADDRESS_ID = 'dddddddd-0000-0000-0000-000000000004';

// ── Tests ────────────────────────────────────────────────────────────

describe('VacancyAddressReviewController', () => {
  let controller: VacancyAddressReviewController;

  beforeEach(() => {
    mockQuery.mockReset();
    controller = new VacancyAddressReviewController();
  });

  // ── resolve with existing patient_address_id ─────────────────────

  describe('resolve with patient_address_id', () => {
    it('returns 200 and updated data when address belongs to patient', async () => {
      // 1. vacancy lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      // 2. ownership check
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // 3. UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: VACANCY_ID, patient_address_id: ADDRESS_ID },
      });
    });

    it('issues correct SQL for vacancy lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      const lookupSql = mockQuery.mock.calls[0][0] as string;
      expect(lookupSql).toContain('deleted_at IS NULL');
      expect(mockQuery.mock.calls[0][1]).toEqual([VACANCY_ID]);
    });

    it('issues parameterized UPDATE with address id and vacancy id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      const updateParams = mockQuery.mock.calls[2][1] as any[];
      expect(updateParams[0]).toBe(ADDRESS_ID);
      expect(updateParams[1]).toBe(VACANCY_ID);
    });
  });

  // ── resolve with createAddress ───────────────────────────────────

  describe('resolve with createAddress', () => {
    it('inserts new address and updates vacancy, returns 200', async () => {
      // 1. vacancy lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      // 2. INSERT patient_address
      mockQuery.mockResolvedValueOnce({ rows: [{ id: NEW_ADDRESS_ID }] });
      // 3. ownership check
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // 4. UPDATE job_postings
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq(
        {
          createAddress: {
            address_formatted: 'Rua A, 123',
            address_raw: 'Rua A 123',
            address_type: 'primary',
          },
        },
        { id: VACANCY_ID },
      );
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: VACANCY_ID, patient_address_id: NEW_ADDRESS_ID },
      });
    });

    it('INSERT uses source=admin_review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: NEW_ADDRESS_ID }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq(
        { createAddress: { address_formatted: 'Av B', address_type: 'secondary' } },
        { id: VACANCY_ID },
      );
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      const insertSql = mockQuery.mock.calls[1][0] as string;
      expect(insertSql).toContain("'admin_review'");
    });

    it('returns 422 when vacancy has no patient_id and createAddress is provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: null }] });

      const req = mockReq(
        { createAddress: { address_formatted: 'Rua X', address_type: 'primary' } },
        { id: VACANCY_ID },
      );
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });
  });

  // ── ownership failure ────────────────────────────────────────────

  describe('ownership validation', () => {
    it('returns 422 when patient_address_id does not belong to vacancy patient', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: PATIENT_ID }] });
      // ownership check: empty — address not found for patient
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ patient_address_id: 'eeeeeeee-0000-0000-0000-999999999999' }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Address does not belong to the vacancy patient',
        }),
      );
      // UPDATE must NOT have been called
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ── vacancy not found ────────────────────────────────────────────

  describe('vacancy not found', () => {
    it('returns 404 when vacancy does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: 'nonexistent-id' });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Vacancy not found' });
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ── vacancy without patient_id ───────────────────────────────────

  describe('vacancy with null patient_id', () => {
    it('skips ownership check and still updates when patient_address_id is provided', async () => {
      // Vacancy has no patient; we allow the UPDATE to proceed (address was provided explicitly)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VACANCY_ID, patient_id: null }] });
      // No ownership check because patientId is null
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: VACANCY_ID, patient_address_id: ADDRESS_ID },
      });
      // Only 2 queries: vacancy lookup + UPDATE (no ownership check)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ── invalid body ─────────────────────────────────────────────────

  describe('invalid body', () => {
    it('returns 400 when body is empty', async () => {
      const req = mockReq({}, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when patient_address_id is not a UUID', async () => {
      const req = mockReq({ patient_address_id: 'not-a-uuid' }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when createAddress has empty address_formatted', async () => {
      const req = mockReq(
        { createAddress: { address_formatted: '', address_type: 'primary' } },
        { id: VACANCY_ID },
      );
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── DB error ─────────────────────────────────────────────────────

  describe('database errors', () => {
    it('returns 500 when DB throws on vacancy lookup', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection reset'));

      const req = mockReq({ patient_address_id: ADDRESS_ID }, { id: VACANCY_ID });
      const res = mockRes();

      await controller.resolveAddressReview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, details: 'connection reset' }),
      );
    });
  });
});
