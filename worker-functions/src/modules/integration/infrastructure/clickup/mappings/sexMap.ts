import type { Sex } from '@modules/case';

/**
 * Translates ClickUp "Sexo Asignado al Nacer (Uso Clínico)" drop-down labels
 * to canonical Sex.
 */
export const CLICKUP_TO_SEX: Record<string, Sex> = {
  'Femenino':          'FEMALE',      // ClickUp: "Femenino" (es)
  'Masculino':         'MALE',        // ClickUp: "Masculino" (es)
  'Intersex':          'INTERSEX',    // ClickUp: "Intersex"
  'Prefiero no decir': 'UNDISCLOSED', // ClickUp: "Prefiero no decir" (es)
};

export function mapClickUpSex(label: string | null): Sex | null {
  if (!label) return null;
  return CLICKUP_TO_SEX[label] ?? null;
}
