/**
 * Profession — canonical vocabulary for worker/service professional role.
 * Vocabulary enforced in DB via CHECK constraint since migration 064.
 * Applies to: workers.profession, workers.occupation, job_postings.required_profession,
 * and (via migration 139) patients.service_type[].
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type Profession = 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST';

export const PROFESSIONS: readonly Profession[] = [
  'AT',
  'CAREGIVER',
  'NURSE',
  'KINESIOLOGIST',
  'PSYCHOLOGIST',
] as const;

export function isProfession(value: unknown): value is Profession {
  return typeof value === 'string' && (PROFESSIONS as readonly string[]).includes(value);
}
