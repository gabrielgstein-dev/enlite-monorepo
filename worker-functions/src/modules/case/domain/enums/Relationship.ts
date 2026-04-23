/**
 * Relationship — canonical vocabulary for patient responsible's relationship to patient.
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type Relationship =
  | 'CHILD'
  | 'PARENT'
  | 'SIBLING'
  | 'NEPHEW'
  | 'GRANDCHILD'
  | 'GUARDIAN'
  | 'FRIEND'
  | 'PARTNER'
  | 'OTHER';

export const RELATIONSHIPS: readonly Relationship[] = [
  'CHILD',
  'PARENT',
  'SIBLING',
  'NEPHEW',
  'GRANDCHILD',
  'GUARDIAN',
  'FRIEND',
  'PARTNER',
  'OTHER',
] as const;

export function isRelationship(value: unknown): value is Relationship {
  return typeof value === 'string' && (RELATIONSHIPS as readonly string[]).includes(value);
}
