export type WorkerOccupation = 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST';

// Blacklist and Publication types have moved to src/modules/audit/domain/.
// Import them via the barrel: import { Blacklist, Publication } from '@modules/audit'.

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
