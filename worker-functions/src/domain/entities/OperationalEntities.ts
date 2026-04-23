export type WorkerOccupation = 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST';

// Blacklist and Publication types have moved to src/modules/audit/domain/.
// Import them via the barrel: import { Blacklist, Publication } from '@modules/audit'.

// WorkerDocExpiry has moved to src/modules/worker/domain/WorkerDocExpiry.ts
// Import via barrel: import { WorkerDocExpiry, UpdateDocExpiryDTO } from '@modules/worker'
export type { WorkerDocExpiry, UpdateDocExpiryDTO } from '../../modules/worker/domain/WorkerDocExpiry';


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
