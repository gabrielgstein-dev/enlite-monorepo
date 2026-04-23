// =====================
// Blacklist
// =====================
export interface Blacklist {
  id: string;
  workerId: string | null;
  workerRawName: string | null;
  workerRawPhone: string | null;
  reason: string;
  detail: string | null;
  registeredBy: string | null;
  canTakeEventual: boolean;
  createdAt: Date;
}

export interface CreateBlacklistDTO {
  workerId?: string | null;
  workerRawName?: string | null;
  workerRawPhone?: string | null;
  reason: string;
  detail?: string | null;
  registeredBy?: string | null;
  canTakeEventual?: boolean;
}
