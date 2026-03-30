/**
 * UpdateEncuadreResultUseCase.test.ts
 *
 * Tests the use case that updates encuadre resultado with structured rejection categories
 * and recalculates worker avg_quality_rating.
 *
 * Scenarios:
 * 1. Successfully updates resultado and rejection category
 * 2. Recalculates avg_quality_rating when worker is linked
 * 3. Skips quality recalculation when no worker linked
 * 4. Throws when encuadre not found
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

import { UpdateEncuadreResultUseCase } from '../UpdateEncuadreResultUseCase';

describe('UpdateEncuadreResultUseCase', () => {
  let useCase: UpdateEncuadreResultUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new UpdateEncuadreResultUseCase();
  });

  it('updates resultado and rejection_reason_category on encuadre', async () => {
    mockQuery
      // First call: UPDATE encuadres
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ worker_id: 'worker-abc', job_posting_id: 'jp-123' }],
      })
      // Second call: UPDATE workers (recalculate rating)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await useCase.execute({
      encuadreId: 'enc-001',
      resultado: 'RECHAZADO',
      rejectionReasonCategory: 'DISTANCE',
      rejectionReason: 'Lives too far from patient',
    });

    expect(result.success).toBe(true);
    expect(result.encuadreId).toBe('enc-001');
    expect(result.resultado).toBe('RECHAZADO');

    // Verify first query: UPDATE encuadres
    const [updateQuery, updateValues] = mockQuery.mock.calls[0];
    expect(updateQuery).toContain('UPDATE encuadres');
    expect(updateQuery).toContain('rejection_reason_category');
    expect(updateValues[0]).toBe('enc-001');
    expect(updateValues[1]).toBe('RECHAZADO');
    expect(updateValues[2]).toBe('DISTANCE');
    expect(updateValues[3]).toBe('Lives too far from patient');

    // Verify second query: UPDATE workers (quality rating recalculation)
    const [ratingQuery, ratingValues] = mockQuery.mock.calls[1];
    expect(ratingQuery).toContain('avg_quality_rating');
    expect(ratingQuery).toContain('worker_placement_audits');
    expect(ratingValues[0]).toBe('worker-abc');
  });

  it('skips quality recalculation when encuadre has no linked worker', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ worker_id: null, job_posting_id: 'jp-123' }],
    });

    const result = await useCase.execute({
      encuadreId: 'enc-002',
      resultado: 'PENDIENTE',
    });

    expect(result.success).toBe(true);
    // Only one query should be called (the update), not the rating recalculation
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('throws when encuadre is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      useCase.execute({
        encuadreId: 'enc-nonexistent',
        resultado: 'RECHAZADO',
      })
    ).rejects.toThrow('Encuadre enc-nonexistent not found');
  });

  it('sets null for optional fields when not provided', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ worker_id: 'worker-xyz', job_posting_id: 'jp-456' }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await useCase.execute({
      encuadreId: 'enc-003',
      resultado: 'SELECCIONADO',
    });

    const [, updateValues] = mockQuery.mock.calls[0];
    expect(updateValues[2]).toBeNull(); // rejectionReasonCategory
    expect(updateValues[3]).toBeNull(); // rejectionReason
  });
});
