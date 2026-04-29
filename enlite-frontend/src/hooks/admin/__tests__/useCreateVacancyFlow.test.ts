import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCreateVacancyFlow } from '../useCreateVacancyFlow';

// ── Mock AdminApiService ────────────────────────────────────────
const mockCreatePatientAddress = vi.fn();

vi.mock('@infrastructure/http/AdminApiService', () => ({
  AdminApiService: {
    createPatientAddress: (...args: any[]) => mockCreatePatientAddress(...args),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────

const PARSED_RESULT = {
  vacancy: { case_number: 7 },
  prescreening: { questions: [], faq: [] },
  description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
};

const ADDRESS_MATCH = {
  patient_address_id: 'addr-1',
  addressFormatted: 'Av. Corrientes 1234',
  confidence: 1,
  matchType: 'EXACT' as const,
};

const CLASH = {
  field: 'dependency_level',
  pdfValue: 'HIGH',
  patientValue: 'LOW',
  action: 'CLASH' as const,
};

// ── Tests ────────────────────────────────────────────────────────

describe('useCreateVacancyFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts at step 0', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      expect(result.current.step).toBe(0);
    });

    it('has empty addressMatches and fieldClashes', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      expect(result.current.addressMatches).toEqual([]);
      expect(result.current.fieldClashes).toEqual([]);
    });

    it('has null patientId and selectedAddressId', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      expect(result.current.patientId).toBeNull();
      expect(result.current.selectedAddressId).toBeNull();
    });
  });

  // ── advanceFromStep0 ──────────────────────────────────────────

  describe('advanceFromStep0', () => {
    it('goes to step 1 when addressMatches has items', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [ADDRESS_MATCH],
          fieldClashes: [],
          patientId: 'pat-1',
        });
      });
      expect(result.current.step).toBe(1);
    });

    it('goes to step 1 when patientId is non-null (even with empty matches)', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [],
          fieldClashes: [],
          patientId: 'pat-99',
        });
      });
      expect(result.current.step).toBe(1);
    });

    it('goes to step 3 when no addresses and no patientId and no clashes (text mode)', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [],
          fieldClashes: [],
          patientId: null,
        });
      });
      expect(result.current.step).toBe(3);
    });

    it('goes to step 1 when there are clashes but patientId is non-null', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [],
          fieldClashes: [CLASH],
          patientId: 'pat-2',
        });
      });
      expect(result.current.step).toBe(1);
    });

    it('stores parsedResult, addressMatches, fieldClashes and patientId', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [ADDRESS_MATCH],
          fieldClashes: [CLASH],
          patientId: 'pat-3',
        });
      });
      expect(result.current.parsedResult).toEqual(PARSED_RESULT);
      expect(result.current.addressMatches).toEqual([ADDRESS_MATCH]);
      expect(result.current.fieldClashes).toEqual([CLASH]);
      expect(result.current.patientId).toBe('pat-3');
    });

    it('resets selectedAddressId and resolvedClashes', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      // First resolve something
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [], patientId: 'p',
        });
      });
      act(() => result.current.selectAddress('addr-1'));
      // Re-advance
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [], fieldClashes: [], patientId: null,
        });
      });
      expect(result.current.selectedAddressId).toBeNull();
      expect(result.current.resolvedClashes).toEqual({});
    });
  });

  // ── skipToStep3 ───────────────────────────────────────────────

  describe('skipToStep3', () => {
    it('jumps directly to step 3', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.skipToStep3());
      expect(result.current.step).toBe(3);
    });

    it('clears patientId and matches', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [], patientId: 'p',
        });
      });
      act(() => result.current.skipToStep3());
      expect(result.current.patientId).toBeNull();
      expect(result.current.addressMatches).toEqual([]);
    });
  });

  // ── selectAddress ──────────────────────────────────────────────

  describe('selectAddress', () => {
    it('sets selectedAddressId', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.selectAddress('addr-99'));
      expect(result.current.selectedAddressId).toBe('addr-99');
    });
  });

  // ── createPatientAddress ──────────────────────────────────────

  describe('createPatientAddress', () => {
    it('calls AdminApiService.createPatientAddress and returns new id', async () => {
      mockCreatePatientAddress.mockResolvedValueOnce({ id: 'addr-new', patient_id: 'pat-1', address_formatted: 'Av X 1' });
      const { result } = renderHook(() => useCreateVacancyFlow());

      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [], fieldClashes: [], patientId: 'pat-1',
        });
      });

      let newId: string = '';
      await act(async () => {
        newId = await result.current.createPatientAddress({
          addressFormatted: 'Av X 1',
          addressType: 'primary',
        });
      });

      expect(newId).toBe('addr-new');
      expect(result.current.selectedAddressId).toBe('addr-new');
      expect(result.current.addressMatches).toHaveLength(1);
    });

    it('throws and sets addressError when API fails', async () => {
      mockCreatePatientAddress.mockRejectedValueOnce(new Error('network error'));
      const { result } = renderHook(() => useCreateVacancyFlow());

      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [], fieldClashes: [], patientId: 'pat-1',
        });
      });

      await act(async () => {
        await expect(
          result.current.createPatientAddress({ addressFormatted: 'bad', addressType: 'primary' })
        ).rejects.toThrow('network error');
      });

      expect(result.current.addressError).toBe('network error');
    });

    it('throws when patientId is null', async () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      await act(async () => {
        await expect(
          result.current.createPatientAddress({ addressFormatted: 'X', addressType: 'primary' })
        ).rejects.toThrow('patientId is required');
      });
    });
  });

  // ── advanceFromStep1 ───────────────────────────────────────────

  describe('advanceFromStep1', () => {
    it('goes to step 2 when there are CLASH field clashes', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [CLASH], patientId: 'p',
        });
      });
      act(() => result.current.advanceFromStep1());
      expect(result.current.step).toBe(2);
    });

    it('goes to step 2 even when there are no CLASH field clashes (confirmation screen)', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [], patientId: 'p',
        });
      });
      act(() => result.current.advanceFromStep1());
      expect(result.current.step).toBe(2);
    });

    it('goes to step 2 even when all clashes have action IDENTICAL (confirmation screen)', () => {
      const identicalClash = { ...CLASH, action: 'IDENTICAL' as const };
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [identicalClash], patientId: 'p',
        });
      });
      act(() => result.current.advanceFromStep1());
      expect(result.current.step).toBe(2);
    });
  });

  // ── advanceFromStep2 ───────────────────────────────────────────

  describe('advanceFromStep2', () => {
    it('goes to step 3', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [CLASH], patientId: 'p',
        });
      });
      act(() => result.current.advanceFromStep1());
      act(() => result.current.advanceFromStep2());
      expect(result.current.step).toBe(3);
    });
  });

  // ── setStep4 / setStep5 ────────────────────────────────────────

  describe('setStep4 / setStep5', () => {
    it('setStep4 goes to step 4', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.setStep4());
      expect(result.current.step).toBe(4);
    });

    it('setStep5 goes to step 5', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.setStep5());
      expect(result.current.step).toBe(5);
    });
  });

  // ── goBack ────────────────────────────────────────────────────

  describe('goBack', () => {
    it('stays at step 0 when already at step 0', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.goBack());
      expect(result.current.step).toBe(0);
    });

    it('goes back to step 0 from step 1', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [], patientId: 'p',
        });
      });
      act(() => result.current.goBack());
      expect(result.current.step).toBe(0);
    });

    it('goes back to step 0 from step 2', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT, addressMatches: [ADDRESS_MATCH], fieldClashes: [CLASH], patientId: 'p',
        });
      });
      // After advanceFromStep0 with clashes, step should be 1
      act(() => result.current.advanceFromStep1());
      // After advanceFromStep1 with CLASH clashes, step should be 2
      act(() => result.current.goBack());
      expect(result.current.step).toBe(0);
    });

    it('goes back to previous step from step 3', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.setStep4());
      act(() => result.current.goBack());
      expect(result.current.step).toBe(3);
    });
  });

  // ── resolveClash ──────────────────────────────────────────────

  describe('resolveClash', () => {
    it('sets resolution for a field', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.resolveClash('dependency_level', 'use_pdf'));
      expect(result.current.resolvedClashes['dependency_level']).toBe('use_pdf');
    });

    it('can change resolution', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => result.current.resolveClash('dependency_level', 'use_pdf'));
      act(() => result.current.resolveClash('dependency_level', 'keep_patient'));
      expect(result.current.resolvedClashes['dependency_level']).toBe('keep_patient');
    });
  });

  // ── buildUpdatePatientPayload ─────────────────────────────────

  describe('buildUpdatePatientPayload', () => {
    it('returns empty object when no resolutions', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      expect(result.current.buildUpdatePatientPayload()).toEqual({});
    });

    it('includes only fields with use_pdf resolution', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [],
          fieldClashes: [
            { field: 'dependency_level', pdfValue: 'HIGH', patientValue: 'LOW', action: 'CLASH' },
            { field: 'pathology_types', pdfValue: 'TEA', patientValue: 'TGD', action: 'CLASH' },
          ],
          patientId: null,
        });
        result.current.resolveClash('dependency_level', 'use_pdf');
        result.current.resolveClash('pathology_types', 'keep_patient');
      });
      expect(result.current.buildUpdatePatientPayload()).toEqual({ dependency_level: 'HIGH' });
    });

    it('excludes fields with null pdfValue', () => {
      const { result } = renderHook(() => useCreateVacancyFlow());
      act(() => {
        result.current.advanceFromStep0({
          parsed: PARSED_RESULT,
          addressMatches: [],
          fieldClashes: [{ field: 'dependency_level', pdfValue: null, patientValue: 'LOW', action: 'CLASH' }],
          patientId: null,
        });
        result.current.resolveClash('dependency_level', 'use_pdf');
      });
      expect(result.current.buildUpdatePatientPayload()).toEqual({});
    });
  });
});
