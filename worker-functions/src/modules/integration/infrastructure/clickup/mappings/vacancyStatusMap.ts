/**
 * Translates ClickUp "Estado de Pacientes" task status to canonical Enlite status values.
 *
 * ClickUp has ONE status per task, shared by paciente and vaga.
 * Enlite stores them separately:
 *   - patients.status  → PatientStatus  (migration 143)
 *   - job_postings.status → JobPostingStatus
 *
 * Source of truth: memory project_status_clickup_vs_enlite.md (2026-04-24)
 */

import type { PatientStatus } from '../../../../case/domain/enums/PatientStatus';

export interface VacancyStatusMapping {
  patientStatus: PatientStatus;
  jobPostingStatus: string;
}

/**
 * Maps a ClickUp task status (lowercase) to the dual Enlite status pair.
 * Keys must be lowercased before lookup.
 */
export const CLICKUP_TO_VACANCY_STATUS: Record<string, VacancyStatusMapping> = {
  // ClickUp: "Activación pendiente"
  'activación pendiente':   { patientStatus: 'ACTIVE', jobPostingStatus: 'PENDING_ACTIVATION' },
  // ClickUp: "Activo"
  'activo':                 { patientStatus: 'ACTIVE', jobPostingStatus: 'ACTIVE' },
  // ClickUp: "Equipe de resposta rápida" (PT variant)
  'equipe de resposta rápida': { patientStatus: 'ACTIVE', jobPostingStatus: 'FULLY_STAFFED' },
  // ClickUp: "Equipo de respuesta rapida" (ES variant)
  'equipo de respuesta rapida': { patientStatus: 'ACTIVE', jobPostingStatus: 'FULLY_STAFFED' },
  // ClickUp: "Reemplazo"
  'reemplazo':              { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING_REPLACEMENT' },
  // ClickUp: "Reemplazos"
  'reemplazos':             { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING_REPLACEMENT' },
  // ClickUp: "Suspendido Temporariamente" (PT variant)
  'suspendido temporariamente': { patientStatus: 'SUSPENDED', jobPostingStatus: 'SUSPENDED' },
  // ClickUp: "Suspendido Temporalmente" (ES variant)
  'suspendido temporalmente':   { patientStatus: 'SUSPENDED', jobPostingStatus: 'SUSPENDED' },
  // ClickUp: "Baja"
  'baja':                   { patientStatus: 'DISCONTINUED', jobPostingStatus: 'CLOSED' },
  // ClickUp: "Alta"
  'alta':                   { patientStatus: 'DISCHARGED', jobPostingStatus: 'CLOSED' },
  // ClickUp: "Busqueda" (sin tilde)
  'busqueda':               { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING' },
  // ClickUp: "Búsqueda" (con tilde)
  'búsqueda':               { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING' },
  // ClickUp: "Vacante Abierta"
  'vacante abierta':        { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING' },
  // ClickUp: "Vacante Abierto" (gender variant)
  'vacante abierto':        { patientStatus: 'ACTIVE', jobPostingStatus: 'SEARCHING' },
};

export function mapClickUpVacancyStatus(
  clickupStatus: string | null | undefined,
): VacancyStatusMapping | null {
  if (!clickupStatus) return null;
  const key = clickupStatus.trim().toLowerCase();
  return CLICKUP_TO_VACANCY_STATUS[key] ?? null;
}
