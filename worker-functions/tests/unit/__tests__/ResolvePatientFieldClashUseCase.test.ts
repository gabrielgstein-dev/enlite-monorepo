/**
 * ResolvePatientFieldClashUseCase — Unit Tests
 *
 * Coverage:
 *   (a) pathology same (case-insensitive) → IDENTICAL → not returned
 *   (b) pathology differs → CLASH → returned
 *   (c) PDF has dependency, patient null → PDF_ONLY
 *   (d) both null → not returned
 *   (e) patient has value, PDF null → PATIENT_ONLY
 *   (f) patient not found → empty array
 */

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({ getPool: () => ({}) }),
  },
}));

import { ResolvePatientFieldClashUseCase } from '../../../src/modules/matching/application/ResolvePatientFieldClashUseCase';

// ── Helpers ───────────────────────────────────────────────────────

function makeUseCase(patientRow: { diagnosis: string | null; dependency_level: string | null } | null) {
  const mockPool = {
    query: jest.fn().mockResolvedValue({
      rows: patientRow ? [patientRow] : [],
    }),
  };
  const uc = Object.create(ResolvePatientFieldClashUseCase.prototype);
  (uc as any).pool = mockPool;
  return uc as ResolvePatientFieldClashUseCase;
}

// ─────────────────────────────────────────────────────────────────

describe('ResolvePatientFieldClashUseCase', () => {
  const PATIENT_ID = 'patient-uuid-001';

  it('(a) pathology same (case-insensitive) → not returned', async () => {
    const uc = makeUseCase({ diagnosis: 'TEA', dependency_level: null });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: 'tea',
      pdfDependencyLevel: null,
    });

    // IDENTICAL → not returned; both null → not returned
    expect(result).toHaveLength(0);
  });

  it('(b) pathology differs → CLASH returned', async () => {
    const uc = makeUseCase({ diagnosis: 'TEA', dependency_level: null });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: 'TGD',
      pdfDependencyLevel: null,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      field: 'pathology_types',
      pdfValue: 'TGD',
      patientValue: 'TEA',
      action: 'CLASH',
    });
  });

  it('(c) PDF has dependency, patient null → PDF_ONLY', async () => {
    const uc = makeUseCase({ diagnosis: null, dependency_level: null });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: null,
      pdfDependencyLevel: 'TOTAL',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      field: 'dependency_level',
      pdfValue: 'TOTAL',
      patientValue: null,
      action: 'PDF_ONLY',
    });
  });

  it('(d) both null → not returned', async () => {
    const uc = makeUseCase({ diagnosis: null, dependency_level: null });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: null,
      pdfDependencyLevel: null,
    });

    expect(result).toHaveLength(0);
  });

  it('(e) patient has value, PDF null → PATIENT_ONLY', async () => {
    const uc = makeUseCase({ diagnosis: 'Alzheimer', dependency_level: 'MODERATE' });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: null,
      pdfDependencyLevel: null,
    });

    // Both fields: patient has value, pdf null → PATIENT_ONLY
    expect(result).toHaveLength(2);
    const fields = result.map((r) => r.field);
    expect(fields).toContain('pathology_types');
    expect(fields).toContain('dependency_level');
    result.forEach((r) => expect(r.action).toBe('PATIENT_ONLY'));
  });

  it('(f) patient not found → empty array', async () => {
    const uc = makeUseCase(null);

    const result = await uc.execute({
      patientId: 'unknown-uuid',
      pdfPathologyTypes: 'TEA',
      pdfDependencyLevel: 'TOTAL',
    });

    expect(result).toHaveLength(0);
  });

  it('(g) whitespace-only trimming considered equal → not returned', async () => {
    const uc = makeUseCase({ diagnosis: '  TEA  ', dependency_level: null });

    const result = await uc.execute({
      patientId: PATIENT_ID,
      pdfPathologyTypes: 'TEA',
      pdfDependencyLevel: null,
    });

    expect(result).toHaveLength(0);
  });
});
