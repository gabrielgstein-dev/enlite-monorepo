/**
 * DependencyLevel — canonical vocabulary for patient dependency level.
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type DependencyLevel = 'SEVERE' | 'VERY_SEVERE' | 'MODERATE' | 'MILD';

export const DEPENDENCY_LEVELS: readonly DependencyLevel[] = [
  'SEVERE',
  'VERY_SEVERE',
  'MODERATE',
  'MILD',
] as const;

export function isDependencyLevel(value: unknown): value is DependencyLevel {
  return typeof value === 'string' && (DEPENDENCY_LEVELS as readonly string[]).includes(value);
}
