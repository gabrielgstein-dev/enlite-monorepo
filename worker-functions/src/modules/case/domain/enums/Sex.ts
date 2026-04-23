/**
 * Sex — canonical vocabulary for assigned sex at birth (clinical use only).
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type Sex = 'FEMALE' | 'MALE' | 'INTERSEX' | 'UNDISCLOSED';

export const SEXES: readonly Sex[] = [
  'FEMALE',
  'MALE',
  'INTERSEX',
  'UNDISCLOSED',
] as const;

export function isSex(value: unknown): value is Sex {
  return typeof value === 'string' && (SEXES as readonly string[]).includes(value);
}
