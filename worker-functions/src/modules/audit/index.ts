/**
 * audit module — barrel export.
 * External code MUST import only from this file.
 * Direct imports from audit/domain/* or audit/infrastructure/* are forbidden
 * (enforced by lint rule in .eslintrc.js).
 */

// Domain types
export type { Blacklist, CreateBlacklistDTO } from './domain/Blacklist';
export type { Publication, CreatePublicationDTO } from './domain/Publication';

// Infrastructure — repositories (named exports)
export {
  PlacementAuditRepository,
  CoordinatorScheduleRepository,
  DocExpiryRepository,
} from './infrastructure/AuditRepositories';

// DTOs exported by AuditRepositories
export type {
  CreatePlacementAuditDTO,
  CreateCoordinatorScheduleDTO,
} from './infrastructure/AuditRepositories';
