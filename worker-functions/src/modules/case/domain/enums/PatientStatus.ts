/**
 * PatientStatus — canonical vocabulary for clinical lifecycle of a patient.
 *
 * Derived from ClickUp "Estado de Pacientes" task status via vacancyStatusMap.
 * Rule: feedback_enum_values_english_uppercase.md
 *
 * Values must match the CHECK constraint in patients table:
 *   PENDING_ADMISSION | ACTIVE | SUSPENDED | DISCONTINUED | DISCHARGED | ADMISSION
 *
 * Migration 143: first 5 values.
 * Migration 147: adds ADMISSION (ClickUp: "admisión" — pre-onboarding, no vacancy yet).
 */

export type PatientStatus =
  | 'PENDING_ADMISSION'  // em processo de admissão (docs, autorizações)
  | 'ACTIVE'             // paciente admitido, recebendo serviços
  | 'SUSPENDED'          // pausado temporariamente (internação/viagem)
  | 'DISCONTINUED'       // paciente desistiu ('Baja' no ClickUp)
  | 'DISCHARGED'         // paciente melhorou e recebeu alta ('Alta' no ClickUp)
  | 'ADMISSION';         // em onboarding inicial (ClickUp: 'admisión') — sem vaga ainda

export const PATIENT_STATUSES: readonly PatientStatus[] = [
  'PENDING_ADMISSION',
  'ACTIVE',
  'SUSPENDED',
  'DISCONTINUED',
  'DISCHARGED',
  'ADMISSION',
] as const;

export function isPatientStatus(value: unknown): value is PatientStatus {
  return typeof value === 'string' && (PATIENT_STATUSES as readonly string[]).includes(value);
}
