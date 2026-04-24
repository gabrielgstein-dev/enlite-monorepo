/**
 * Gender — canonical vocabulary for worker gender identity.
 * Stored in workers.gender_encrypted (VARCHAR(20), KMS encrypted, HIPAA #10).
 * No DB CHECK constraint — field is encrypted; any canonical value works.
 * Rule: feedback_enum_values_english_uppercase.md
 *
 * Source: ClickUp "Admisiones" list, field "Sexo Prestador".
 * Despite the field name, the presence of "Trans" indicates this captures
 * gender identity, not biological sex.
 */

export type Gender = 'MALE' | 'FEMALE' | 'TRANS' | 'NON_BINARY' | 'UNDISCLOSED';

export const GENDER_VALUES: readonly Gender[] = [
  'MALE',
  'FEMALE',
  'TRANS',
  'NON_BINARY',
  'UNDISCLOSED',
] as const;

export function isGender(value: unknown): value is Gender {
  return typeof value === 'string' && (GENDER_VALUES as readonly string[]).includes(value);
}
