/**
 * PatientStatus — canonical vocabulary for clinical lifecycle of a patient.
 *
 * Derived from ClickUp "Estado de Pacientes" task status via vacancyStatusMap.
 * Rule: feedback_enum_values_english_uppercase.md
 *
 * Values must match the CHECK constraint in migration 143:
 *   PENDING_ADMISSION | ACTIVE | SUSPENDED | DISCONTINUED | DISCHARGED
 */

export type PatientStatus =
  | 'PENDING_ADMISSION'  // em processo de admissão (docs, autorizações)
  | 'ACTIVE'             // paciente admitido, recebendo serviços
  | 'SUSPENDED'          // pausado temporariamente (internação/viagem)
  | 'DISCONTINUED'       // paciente desistiu ('Baja' no ClickUp)
  | 'DISCHARGED';        // paciente melhorou e recebeu alta ('Alta' no ClickUp)

export const PATIENT_STATUSES: readonly PatientStatus[] = [
  'PENDING_ADMISSION',
  'ACTIVE',
  'SUSPENDED',
  'DISCONTINUED',
  'DISCHARGED',
] as const;

export function isPatientStatus(value: unknown): value is PatientStatus {
  return typeof value === 'string' && (PATIENT_STATUSES as readonly string[]).includes(value);
}
