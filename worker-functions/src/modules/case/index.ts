/**
 * case module — barrel export.
 * External code MUST import only from this file.
 * Direct imports from case/domain/* or case/infrastructure/* are forbidden
 * (enforced by lint rule in .eslintrc.js).
 */

// Domain types
export type { PatientIdentity } from './domain/PatientIdentity';
export type { PatientClinical } from './domain/PatientClinical';
export type {
  PatientResponsible,
  PatientResponsibleInput,
  ContactChannelValidationInput,
} from './domain/PatientResponsible';
export { validateContactChannel } from './domain/PatientResponsible';

// Application
export { PatientService } from './application/PatientService';
export type { PatientServiceUpsertInput } from './application/PatientService';

// Infrastructure (exposed for explicit consumers like backfill scripts)
export { PatientIdentityRepository } from './infrastructure/PatientIdentityRepository';
export { PatientClinicalRepository } from './infrastructure/PatientClinicalRepository';
export { PatientResponsibleRepository } from './infrastructure/PatientResponsibleRepository';
export type { PatientIdentityUpsertInput } from './infrastructure/PatientIdentityRepository';
export type { PatientClinicalUpsertInput } from './infrastructure/PatientClinicalRepository';
