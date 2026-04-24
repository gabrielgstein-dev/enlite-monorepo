import type { Profession } from '@modules/worker/domain/enums/Profession';

/**
 * Translates ClickUp "Tipo de Profesional" drop-down labels
 * to canonical Profession (UPPERCASE EN per feedback_enum_values_english_uppercase.md).
 *
 * Note: "Estudiante de Psicología" and "Otra" map to null because:
 *   - "Estudiante de Psicología" was deprecated in migration 064 (no DB value exists)
 *   - "Otra" is unclassifiable — do not force an incorrect value
 */
export const CLICKUP_TO_PROFESSION: Record<string, Profession | null> = {
  'Acompañante Terapéutico': 'AT',         // ClickUp: "Acompañante Terapéutico"
  'Cuidado Humano':          'CAREGIVER',  // ClickUp: "Cuidado Humano"
  'Enfermería':              'NURSE',      // ClickUp: "Enfermería"
  'Estudiante de Psicología': null,        // ClickUp: "Estudiante de Psicología" — deprecated
  'Otra':                    null,         // ClickUp: "Otra" — unclassifiable
};

export function mapClickUpProfession(label: string | null): Profession | null {
  if (!label) return null;
  if (!(label in CLICKUP_TO_PROFESSION)) return null;
  return CLICKUP_TO_PROFESSION[label];
}
