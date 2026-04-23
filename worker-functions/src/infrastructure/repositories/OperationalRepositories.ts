// ─── Re-exports para compatibilidade de imports existentes ────────────────────
// @deprecated — PlacementAuditRepository, CoordinatorScheduleRepository, DocExpiryRepository
//               foram movidos para @modules/audit. Importe-os de lá.
// @deprecated — BlacklistRepository, PublicationRepository
//               foram movidos para @modules/audit. Importe-os de lá.
// @deprecated — JobPostingARRepository, WorkerApplicationRepository, WorkerLocationRepository
//               foram movidos para @modules/matching. Importe-os de lá.

export { JobPostingARRepository } from '../../modules/matching/infrastructure/JobPostingARRepository';
export { WorkerApplicationRepository } from '../../modules/matching/infrastructure/WorkerApplicationRepository';
export { WorkerLocationRepository } from '../../modules/matching/infrastructure/WorkerLocationRepository';
