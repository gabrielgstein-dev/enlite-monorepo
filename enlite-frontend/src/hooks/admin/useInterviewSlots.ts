import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type {
  InterviewSlot,
  CreateSlotsInput,
  BookSlotResult,
  InterviewSlotsSummary,
} from '@domain/entities/InterviewSlot';

interface InterviewSlotsState {
  slots: InterviewSlot[];
  summary: InterviewSlotsSummary;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_SUMMARY: InterviewSlotsSummary = {
  total: 0,
  available: 0,
  full: 0,
  cancelled: 0,
};

export function useInterviewSlots(vacancyId: string | undefined) {
  const [state, setState] = useState<InterviewSlotsState>({
    slots: [],
    summary: DEFAULT_SUMMARY,
    isLoading: false,
    error: null,
  });

  const fetchSlots = useCallback(async () => {
    if (!vacancyId) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await AdminApiService.getInterviewSlots(vacancyId);
      setState({
        slots: response.slots,
        summary: response.summary,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load slots',
      }));
    }
  }, [vacancyId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const createSlots = useCallback(async (data: CreateSlotsInput): Promise<void> => {
    if (!vacancyId) return;
    await AdminApiService.createInterviewSlots(vacancyId, data);
    await fetchSlots();
  }, [vacancyId, fetchSlots]);

  const bookSlot = useCallback(async (
    slotId: string,
    encuadreId: string,
    sendInvitation = true,
  ): Promise<BookSlotResult> => {
    const result = await AdminApiService.bookInterviewSlot(slotId, { encuadreId, sendInvitation });
    await fetchSlots();
    return result;
  }, [fetchSlots]);

  const cancelSlot = useCallback(async (slotId: string): Promise<void> => {
    await AdminApiService.cancelInterviewSlot(slotId);
    await fetchSlots();
  }, [fetchSlots]);

  return {
    slots: state.slots,
    summary: state.summary,
    isLoading: state.isLoading,
    error: state.error,
    refetch: fetchSlots,
    createSlots,
    bookSlot,
    cancelSlot,
  };
}
