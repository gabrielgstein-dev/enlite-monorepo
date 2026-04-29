/**
 * useCreateVacancyFlow
 *
 * Orchestrates the 6-step vacancy creation wizard state.
 * Step layout:
 *   0 — Upload PDF (GeminiParseStep)
 *   1 — Confirm patient address (PatientAddressSelector)  [skipped if text mode]
 *   2 — Resolve field clashes (PatientFieldClashResolver) [skipped if no clashes]
 *   3 — Vacancy data form (VacancyDataStep)
 *   4 — Prescreening (PrescreeningStep)
 *   5 — Review & publish (ReviewStep)
 */

import { useState, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type {
  AddressMatchCandidate,
  PatientFieldClash,
  ParsedVacancyResult,
} from '@domain/entities/PatientAddress';

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;
export type ClashResolution = 'keep_patient' | 'use_pdf';

export interface CreateVacancyFlowState {
  step: WizardStep;
  parsedResult: ParsedVacancyResult | null;
  addressMatches: AddressMatchCandidate[];
  fieldClashes: PatientFieldClash[];
  patientId: string | null;
  selectedAddressId: string | null;
  resolvedClashes: Record<string, ClashResolution>;
  isCreatingAddress: boolean;
  addressError: string | null;
}

export interface CreateVacancyFlowActions {
  advanceFromStep0: (result: {
    parsed: ParsedVacancyResult;
    addressMatches: AddressMatchCandidate[];
    fieldClashes: PatientFieldClash[];
    patientId: string | null;
  }) => void;
  skipToStep3: () => void;
  selectAddress: (id: string) => void;
  createPatientAddress: (data: {
    addressFormatted: string;
    addressRaw?: string;
    addressType: string;
  }) => Promise<string>;
  advanceFromStep1: () => void;
  advanceFromStep2: () => void;
  setStep4: () => void;
  setStep5: () => void;
  goBack: () => void;
  resolveClash: (field: string, resolution: ClashResolution) => void;
  buildUpdatePatientPayload: () => Record<string, string>;
}

export function useCreateVacancyFlow(): CreateVacancyFlowState & CreateVacancyFlowActions {
  const [step, setStep] = useState<WizardStep>(0);
  const [parsedResult, setParsedResult] = useState<ParsedVacancyResult | null>(null);
  const [addressMatches, setAddressMatches] = useState<AddressMatchCandidate[]>([]);
  const [fieldClashes, setFieldClashes] = useState<PatientFieldClash[]>([]);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [resolvedClashes, setResolvedClashes] = useState<Record<string, ClashResolution>>({});
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const advanceFromStep0 = useCallback((result: {
    parsed: ParsedVacancyResult;
    addressMatches: AddressMatchCandidate[];
    fieldClashes: PatientFieldClash[];
    patientId: string | null;
  }) => {
    setParsedResult(result.parsed);
    setAddressMatches(result.addressMatches);
    setFieldClashes(result.fieldClashes);
    setPatientId(result.patientId);
    setSelectedAddressId(null);
    setResolvedClashes({});

    const hasAddressWork = result.addressMatches.length > 0;
    const hasClashWork = result.fieldClashes.some(c => c.action === 'CLASH');
    const needsAddressStep = hasAddressWork || result.patientId !== null;

    if (needsAddressStep || hasClashWork) {
      setStep(1);
    } else {
      setStep(3);
    }
  }, []);

  const skipToStep3 = useCallback(() => {
    setAddressMatches([]);
    setFieldClashes([]);
    setPatientId(null);
    setSelectedAddressId(null);
    setResolvedClashes({});
    setStep(3);
  }, []);

  const selectAddress = useCallback((id: string) => {
    setSelectedAddressId(id);
    setAddressError(null);
  }, []);

  const createPatientAddress = useCallback(async (data: {
    addressFormatted: string;
    addressRaw?: string;
    addressType: string;
  }): Promise<string> => {
    if (!patientId) throw new Error('patientId is required');
    setIsCreatingAddress(true);
    setAddressError(null);
    try {
      const row = await AdminApiService.createPatientAddress(patientId, {
        address_formatted: data.addressFormatted,
        address_raw: data.addressRaw,
        address_type: data.addressType,
      });
      setSelectedAddressId(row.id);
      setAddressMatches(prev => [
        ...prev,
        {
          patient_address_id: row.id,
          addressFormatted: data.addressFormatted,
          addressRaw: data.addressRaw ?? null,
          confidence: 1,
          matchType: 'EXACT' as const,
        },
      ]);
      return row.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddressError(msg);
      throw err;
    } finally {
      setIsCreatingAddress(false);
    }
  }, [patientId]);

  const advanceFromStep1 = useCallback(() => {
    setStep(2);
  }, []);

  const advanceFromStep2 = useCallback(() => {
    setStep(3);
  }, []);

  const setStep4 = useCallback(() => setStep(4), []);
  const setStep5 = useCallback(() => setStep(5), []);

  const goBack = useCallback(() => {
    setStep(prev => {
      if (prev === 0) return 0;
      // steps 1 and 2 go back to step 0 (re-upload)
      if (prev === 1 || prev === 2) return 0;
      return (prev - 1) as WizardStep;
    });
  }, []);

  const resolveClash = useCallback((field: string, resolution: ClashResolution) => {
    setResolvedClashes(prev => ({ ...prev, [field]: resolution }));
  }, []);

  const buildUpdatePatientPayload = useCallback((): Record<string, string> => {
    const payload: Record<string, string> = {};
    for (const [field, resolution] of Object.entries(resolvedClashes)) {
      if (resolution === 'use_pdf') {
        const clash = fieldClashes.find(c => c.field === field);
        if (clash?.pdfValue != null) {
          payload[field] = clash.pdfValue;
        }
      }
    }
    return payload;
  }, [resolvedClashes, fieldClashes]);

  return {
    step,
    parsedResult,
    addressMatches,
    fieldClashes,
    patientId,
    selectedAddressId,
    resolvedClashes,
    isCreatingAddress,
    addressError,
    advanceFromStep0,
    skipToStep3,
    selectAddress,
    createPatientAddress,
    advanceFromStep1,
    advanceFromStep2,
    setStep4,
    setStep5,
    goBack,
    resolveClash,
    buildUpdatePatientPayload,
  };
}
