import type { DependencyLevel } from '@modules/case';

/**
 * Translates ClickUp "Dependencia" drop-down labels to canonical DependencyLevel.
 * ClickUp returns orderindex; ClickUpFieldResolver.resolveDropdown() returns the LABEL.
 * This map keys on the label (Spanish text from ClickUp).
 */
export const CLICKUP_TO_DEPENDENCY_LEVEL: Record<string, DependencyLevel> = {
  'GRAVE':     'SEVERE',       // ClickUp: "GRAVE" (es)
  'MUY GRAVE': 'VERY_SEVERE',  // ClickUp: "MUY GRAVE" (es)
  'MODERADA':  'MODERATE',     // ClickUp: "MODERADA" (es)
  'LEVE':      'MILD',         // ClickUp: "LEVE" (es)
};

export function mapClickUpDependencyLevel(label: string | null): DependencyLevel | null {
  if (!label) return null;
  return CLICKUP_TO_DEPENDENCY_LEVEL[label] ?? null;
}
