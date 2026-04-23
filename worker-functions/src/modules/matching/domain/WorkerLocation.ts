// ── WorkerLocation — localização do worker (migration 034) ──────────────────
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
