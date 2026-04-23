import type { Relationship } from '@modules/case';

/**
 * Translates ClickUp "Relación con el Paciente" drop-down labels to canonical Relationship.
 */
export const CLICKUP_TO_RELATIONSHIP: Record<string, Relationship> = {
  'Hijo / Hija':   'CHILD',      // ClickUp: "Hijo / Hija" (es)
  'Madre / Padre': 'PARENT',     // ClickUp: "Madre / Padre" (es)
  'Hermano/a':     'SIBLING',    // ClickUp: "Hermano/a" (es)
  'Sobrino/a':     'NEPHEW',     // ClickUp: "Sobrino/a" (es)
  'Nieto/a':       'GRANDCHILD', // ClickUp: "Nieto/a" (es)
  'Tutor/a':       'GUARDIAN',   // ClickUp: "Tutor/a" (es)
  'Amigo/a':       'FRIEND',     // ClickUp: "Amigo/a" (es)
  'Pareja':        'PARTNER',    // ClickUp: "Pareja" (es)
  'Otro':          'OTHER',      // ClickUp: "Otro" (es)
};

export function mapClickUpRelationship(label: string | null): Relationship | null {
  if (!label) return null;
  return CLICKUP_TO_RELATIONSHIP[label] ?? null;
}
