export type InterviewSlotStatus = 'AVAILABLE' | 'FULL' | 'CANCELLED';

export interface InterviewSlot {
  id: string;
  coordinatorId: string | null;
  jobPostingId: string;
  slotDate: string;        // 'YYYY-MM-DD'
  slotTime: string;        // 'HH:MM'
  slotEndTime: string;     // 'HH:MM'
  meetLink: string | null;
  maxCapacity: number;
  bookedCount: number;
  status: InterviewSlotStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlotInput {
  date: string;        // 'YYYY-MM-DD'
  startTime: string;   // 'HH:MM'
  endTime: string;     // 'HH:MM'
  maxCapacity?: number;
}

export interface CreateInterviewSlotsDTO {
  jobPostingId: string;
  coordinatorId?: string | null;
  meetLink?: string | null;
  notes?: string | null;
  slots: SlotInput[];
}

export interface BookSlotDTO {
  slotId: string;
  encuadreId: string;
  sendInvitation?: boolean;
}

export interface BookSlotResult {
  encuadreId: string;
  slotId: string;
  interviewDate: string;
  interviewTime: string;
  meetLink: string | null;
  invitationQueued: boolean;
}
