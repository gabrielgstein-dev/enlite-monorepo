export type InterviewSlotStatus = 'AVAILABLE' | 'FULL' | 'CANCELLED';

export interface InterviewSlot {
  id: string;
  coordinatorId: string | null;
  jobPostingId: string;
  slotDate: string;      // 'YYYY-MM-DD'
  slotTime: string;      // 'HH:MM'
  slotEndTime: string;   // 'HH:MM'
  meetLink: string | null;
  maxCapacity: number;
  bookedCount: number;
  status: InterviewSlotStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSlotsInput {
  coordinatorId?: string;
  meetLink?: string;
  notes?: string;
  slots: Array<{
    date: string;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
  }>;
}

export interface BookSlotResult {
  encuadreId: string;
  slotId: string;
  interviewDate: string;
  interviewTime: string;
  meetLink: string | null;
  invitationQueued: boolean;
}

export interface InterviewSlotsSummary {
  total: number;
  available: number;
  full: number;
  cancelled: number;
}
