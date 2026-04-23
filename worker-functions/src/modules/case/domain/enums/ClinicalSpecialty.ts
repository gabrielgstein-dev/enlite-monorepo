/**
 * ClinicalSpecialty — canonical vocabulary for patient clinical specialty.
 * Independent dimension from service_type (which captures the professional role).
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type ClinicalSpecialty =
  | 'INTELLECTUAL_DISABILITY'
  | 'NEUROLOGICAL'
  | 'MOTOR_LIMITATIONS'
  | 'ASD'
  | 'PSYCHIATRIC'
  | 'SOCIAL_VULNERABILITY'
  | 'GERIATRIC'
  | 'SPECIFIC_PATHOLOGY'
  | 'CUSTOM';

export const CLINICAL_SPECIALTIES: readonly ClinicalSpecialty[] = [
  'INTELLECTUAL_DISABILITY',
  'NEUROLOGICAL',
  'MOTOR_LIMITATIONS',
  'ASD',
  'PSYCHIATRIC',
  'SOCIAL_VULNERABILITY',
  'GERIATRIC',
  'SPECIFIC_PATHOLOGY',
  'CUSTOM',
] as const;

export function isClinicalSpecialty(value: unknown): value is ClinicalSpecialty {
  return typeof value === 'string' && (CLINICAL_SPECIALTIES as readonly string[]).includes(value);
}
