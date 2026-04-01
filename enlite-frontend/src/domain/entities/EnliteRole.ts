/**
 * Roles for Enlite internal staff who access the admin panel.
 *
 * ADMIN            — full access, manages users and platform configuration
 * RECRUITER        — handles worker recruitment, vacancies and onboarding
 * COMMUNITY_MANAGER — manages AT community, groups and operational support
 *
 * Default for new @enlite.health Google logins: RECRUITER
 */
export enum EnliteRole {
  ADMIN             = 'admin',
  RECRUITER         = 'recruiter',
  COMMUNITY_MANAGER = 'community_manager',
}

export const STAFF_ROLES = [
  EnliteRole.ADMIN,
  EnliteRole.RECRUITER,
  EnliteRole.COMMUNITY_MANAGER,
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
