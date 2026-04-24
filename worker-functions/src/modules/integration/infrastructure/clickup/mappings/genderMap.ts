import type { Gender } from '@modules/worker/domain/enums/Gender';

/**
 * Translates ClickUp "Sexo Prestador" drop-down labels (Admisiones list)
 * to canonical Gender. Despite the field name, the presence of "Trans"
 * indicates this captures gender identity, not biological sex.
 */
export const CLICKUP_TO_GENDER: Record<string, Gender> = {
  'Hombre':            'MALE',        // ClickUp: "Hombre" (Admisiones)
  'Mujer':             'FEMALE',      // ClickUp: "Mujer" (Admisiones)
  'Trans':             'TRANS',       // ClickUp: "Trans" (Admisiones)
  'Prefiero no decir': 'UNDISCLOSED', // ClickUp: "Prefiero no decir" (Admisiones)
};

export function mapClickUpGender(label: string | null): Gender | null {
  if (!label) return null;
  return CLICKUP_TO_GENDER[label] ?? null;
}
