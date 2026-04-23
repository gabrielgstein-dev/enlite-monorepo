import type { ClinicalSpecialty } from '@modules/case';

/**
 * Translates ClickUp "Segmentos Clínicos" drop-down labels to canonical ClinicalSpecialty.
 *
 * ClickUp has 14 options that are combos of (service_tier × specialty).
 * Here we extract only the specialty dimension — the tier is captured via
 * the "Servicio" field (serviceMap.ts → Profession[]).
 */
export const CLICKUP_TO_CLINICAL_SPECIALTY: Record<string, ClinicalSpecialty> = {
  'AT para Pacientes con Discapacidad Intelectual':       'INTELLECTUAL_DISABILITY',  // ClickUp (es)
  'AT para Pacientes con Enfermedades Neurológicas':      'NEUROLOGICAL',              // ClickUp (es)
  'AT para Pacientes con Limitaciones Motrices':          'MOTOR_LIMITATIONS',         // ClickUp (es)
  'AT para Pacientes con TEA':                            'ASD',                       // ClickUp (es)
  'AT para Pacientes con Trastornos Psiquiátricos':       'PSYCHIATRIC',               // ClickUp (es)
  'AT para Personas en Vulnerabilidad Social':            'SOCIAL_VULNERABILITY',      // ClickUp (es)
  'AT para Personas Mayores (Geriatría)':                 'GERIATRIC',                 // ClickUp (es)
  'Cuidado Integral en Discapacidad Intelectual':         'INTELLECTUAL_DISABILITY',   // ClickUp (es)
  'Cuidado Integral en Enfermedades Neurológicas':        'NEUROLOGICAL',              // ClickUp (es)
  'Cuidado Integral en Patologías Específicas':           'SPECIFIC_PATHOLOGY',        // ClickUp (es)
  'Cuidado Integral de Pacientes con TEA':                'ASD',                       // ClickUp (es)
  'Cuidado Integral de Personas Mayores (Geriatría)':     'GERIATRIC',                 // ClickUp (es)
  'Cuidado de Pacientes con Limitaciones Motrices':       'MOTOR_LIMITATIONS',         // ClickUp (es)
  'Segmento Personalizado':                               'CUSTOM',                    // ClickUp (es)
};

export function mapClickUpClinicalSpecialty(label: string | null): ClinicalSpecialty | null {
  if (!label) return null;
  return CLICKUP_TO_CLINICAL_SPECIALTY[label] ?? null;
}
