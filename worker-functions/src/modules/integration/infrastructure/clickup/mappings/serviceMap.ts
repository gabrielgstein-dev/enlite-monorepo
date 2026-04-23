import type { Profession } from '@modules/worker';

/**
 * Translates ClickUp "Servicio" drop-down labels to canonical Profession[].
 *
 * "AT y Cuidador" is a composite selection → array of 2 professions.
 * Maps to the same vocabulary as workers.profession (migration 064).
 */
export const CLICKUP_TO_SERVICE_TYPES: Record<string, Profession[]> = {
  'Acompañante Terapéutico': ['AT'],                    // ClickUp: "Acompañante Terapéutico" (es)
  'Cuidador (a)':            ['CAREGIVER'],              // ClickUp: "Cuidador (a)" (es)
  'AT y Cuidador':           ['AT', 'CAREGIVER'],        // ClickUp: "AT y Cuidador" (es) — composite
  'Psicólogo (a)':           ['PSYCHOLOGIST'],           // ClickUp: "Psicólogo (a)" (es)
};

export function mapClickUpService(label: string | null): Profession[] {
  if (!label) return [];
  return CLICKUP_TO_SERVICE_TYPES[label] ?? [];
}
