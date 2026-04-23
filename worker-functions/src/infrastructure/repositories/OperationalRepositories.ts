// ─── Re-exports para compatibilidade de imports existentes ────────────────────
// @deprecated PlacementAuditRepository, CoordinatorScheduleRepository, DocExpiryRepository
//             foram movidos para @modules/audit. Importe-os de lá.
// @deprecated BlacklistRepository, PublicationRepository
//             foram movidos para @modules/audit. Importe-os de lá.

export { JobPostingARRepository } from './JobPostingARRepository';
export {
  WorkerApplicationRepository,
  WorkerLocationRepository,
} from './WorkerStateRepositories';
