/**
 * MatchPdfAddressToPatientAddressUseCase — Unit Tests
 *
 * Coverage:
 *   (a) exact match → confidence=1.0, EXACT
 *   (b) fuzzy match (first segment) → confidence=0.7, FUZZY
 *   (c) no match → empty candidates array
 *   (d) case_number not found → patientId=null, candidates=[]
 */

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({ getPool: () => ({}) }),
  },
}));

import { MatchPdfAddressToPatientAddressUseCase } from '../../../src/modules/matching/application/MatchPdfAddressToPatientAddressUseCase';

// ── Helpers ───────────────────────────────────────────────────────

function makeUseCase(responses: unknown[]) {
  let callIndex = 0;
  const mockPool = {
    query: jest.fn().mockImplementation(() => {
      const resp = responses[callIndex++];
      return Promise.resolve(resp);
    }),
  };
  const uc = Object.create(MatchPdfAddressToPatientAddressUseCase.prototype);
  (uc as any).pool = mockPool;
  return { uc: uc as MatchPdfAddressToPatientAddressUseCase, mockPool };
}

// ─────────────────────────────────────────────────────────────────

describe('MatchPdfAddressToPatientAddressUseCase', () => {
  const PATIENT_ID = 'patient-uuid-001';

  it('(a) exact match found → confidence=1.0, matchType=EXACT', async () => {
    const { uc } = makeUseCase([
      // 1) job_posting lookup → found
      { rows: [{ patient_id: PATIENT_ID }] },
      // 2) patient_addresses → one row
      { rows: [{ id: 'pa-001', address_formatted: 'Buenos Aires, BA', address_raw: null }] },
    ]);

    const result = await uc.execute({ caseNumber: 100, addressText: 'Buenos Aires, BA' });

    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      patient_address_id: 'pa-001',
      confidence: 1.0,
      matchType: 'EXACT',
    });
  });

  it('(b) fuzzy match — first segment matches → confidence=0.7, matchType=FUZZY', async () => {
    const { uc } = makeUseCase([
      { rows: [{ patient_id: PATIENT_ID }] },
      { rows: [{ id: 'pa-002', address_formatted: 'Av. Corrientes 1234, Buenos Aires, CABA', address_raw: null }] },
    ]);

    const result = await uc.execute({ caseNumber: 200, addressText: 'Buenos Aires, BA' });

    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      patient_address_id: 'pa-002',
      confidence: 0.7,
      matchType: 'FUZZY',
    });
  });

  it('(c) no match → empty candidates array', async () => {
    const { uc } = makeUseCase([
      { rows: [{ patient_id: PATIENT_ID }] },
      { rows: [{ id: 'pa-003', address_formatted: 'Córdoba, Córdoba', address_raw: null }] },
    ]);

    const result = await uc.execute({ caseNumber: 300, addressText: 'Mendoza, Mendoza' });

    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.candidates).toHaveLength(0);
  });

  it('(d) case_number not found in job_postings → patientId=null, candidates=[]', async () => {
    const { uc } = makeUseCase([
      // job_posting lookup → nothing
      { rows: [] },
    ]);

    const result = await uc.execute({ caseNumber: 999, addressText: 'Buenos Aires, BA' });

    expect(result.patientId).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it('(e) caseNumber is null → patientId=null, candidates=[] (no DB call)', async () => {
    const { uc, mockPool } = makeUseCase([]);

    const result = await uc.execute({ caseNumber: null, addressText: 'Buenos Aires' });

    expect(result.patientId).toBeNull();
    expect(result.candidates).toHaveLength(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('(f) patient found but no patient_addresses → empty candidates', async () => {
    const { uc } = makeUseCase([
      { rows: [{ patient_id: PATIENT_ID }] },
      { rows: [] },
    ]);

    const result = await uc.execute({ caseNumber: 400, addressText: 'Buenos Aires, BA' });

    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.candidates).toHaveLength(0);
  });

  it('(g) multiple candidates — sorted by confidence DESC', async () => {
    const { uc } = makeUseCase([
      { rows: [{ patient_id: PATIENT_ID }] },
      {
        rows: [
          { id: 'pa-fuzzy', address_formatted: 'Av. Callao 500, Buenos Aires, CABA', address_raw: null },
          { id: 'pa-exact', address_formatted: 'Buenos Aires, BA', address_raw: null },
        ],
      },
    ]);

    const result = await uc.execute({ caseNumber: 500, addressText: 'Buenos Aires, BA' });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].matchType).toBe('EXACT');
    expect(result.candidates[1].matchType).toBe('FUZZY');
  });

  it('(h) job_posting has null patient_id → patientId=null, candidates=[]', async () => {
    const { uc } = makeUseCase([
      { rows: [{ patient_id: null }] },
    ]);

    const result = await uc.execute({ caseNumber: 600, addressText: 'Buenos Aires' });

    expect(result.patientId).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });
});
