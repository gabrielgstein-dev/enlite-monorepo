export type WorkerOccupation = 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST';


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


// =====================
// Publication
// =====================
export interface Publication {
  id: string;
  jobPostingId: string | null;
  channel: string | null;
  groupName: string | null;
  recruiterName: string | null;
  publishedAt: Date | null;
  observations: string | null;
  dedupHash: string;
  createdAt: Date;
}

export interface CreatePublicationDTO {
  jobPostingId?: string | null;
  channel?: string | null;
  groupName?: string | null;
  recruiterName?: string | null;
  publishedAt?: Date | null;
  observations?: string | null;
  dedupHash: string;
}


// =====================
// WorkerDocExpiry — campos de vencimento (migration 015)
// =====================
export interface WorkerDocExpiry {
  workerId: string;
  criminalRecordExpiry: Date | null;
  insuranceExpiry: Date | null;
  professionalRegExpiry: Date | null;
  // Flags calculadas (da view workers_docs_expiry_alert)
  criminalExpiringSoon?: boolean;
  insuranceExpiringSoon?: boolean;
  profregExpiringSoon?: boolean;
  criminalExpired?: boolean;
  insuranceExpired?: boolean;
  profregExpired?: boolean;
}

export interface UpdateDocExpiryDTO {
  workerId: string;
  criminalRecordExpiry?: Date | null;
  insuranceExpiry?: Date | null;
  professionalRegExpiry?: Date | null;
}


// =====================
// WorkerLocation — localização do worker (migration 034)
// =====================
export interface WorkerLocation {
  id: string;
  workerId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  workZone: string | null;
  interestZone: string | null;
  dataSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkerLocationDTO {
  workerId: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  postalCode?: string | null;
  workZone?: string | null;
  interestZone?: string | null;
  dataSource?: string | null;
}
