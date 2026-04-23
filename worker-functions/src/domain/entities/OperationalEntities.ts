// @deprecated — types moved to their respective modules.
// WorkerOccupation → @modules/matching (via ./domain/WorkerOccupation)
// WorkerLocation, CreateWorkerLocationDTO → @modules/matching (via ./domain/WorkerLocation)
// WorkerDocExpiry, UpdateDocExpiryDTO → @modules/worker

export type { WorkerOccupation } from '../../modules/matching/domain/WorkerOccupation';
export type { WorkerLocation, CreateWorkerLocationDTO } from '../../modules/matching/domain/WorkerLocation';
export type { WorkerDocExpiry, UpdateDocExpiryDTO } from '../../modules/worker/domain/WorkerDocExpiry';
