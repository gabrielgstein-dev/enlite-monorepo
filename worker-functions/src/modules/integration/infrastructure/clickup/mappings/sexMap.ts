import type { Sex } from '@modules/case';

/**
 * Translates ClickUp sex drop-down labels to canonical Sex.
 * Covers the "Estado de Pacientes" list only (Femenino/Masculino/Intersex).
 * The "Admisiones" list uses a separate "Sexo Prestador" field that captures
 * gender identity — see genderMap.ts for that mapping.
 */
export const CLICKUP_TO_SEX: Record<string, Sex> = {
  // Estado de Pacientes list labels
  'Femenino':          'FEMALE',      // ClickUp: "Femenino" (es)
  'Masculino':         'MALE',        // ClickUp: "Masculino" (es)
  'Intersex':          'INTERSEX',    // ClickUp: "Intersex"
  'Prefiero no decir': 'UNDISCLOSED', // ClickUp: "Prefiero no decir" (es)
};

export function mapClickUpSex(label: string | null): Sex | null {
  if (!label) return null;
  return CLICKUP_TO_SEX[label] ?? null;
}
