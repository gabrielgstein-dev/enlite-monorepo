/**
 * ClickUpVacancyMapper — converts a ClickUp "Estado de Pacientes" task to
 * a list of VacancyUpsertInput values (one per filled address slot).
 *
 * Mapping strategy:
 *   - One task represents ONE patient, potentially 1-3 job postings (address slots).
 *   - If no address slots are filled, still returns ONE VacancyUpsertInput with null addresses.
 *   - String literal "null" in address fields is treated as empty.
 *   - Tasks without "Caso Número" → returns [] (skip).
 *   - Subtasks (parent != null) → returns [] (skip).
 *
 * Status mapping: see mappings/vacancyStatusMap.ts and memory project_status_clickup_vs_enlite.md
 */

import { mapClickUpVacancyStatus } from './mappings/vacancyStatusMap';
import type { ClickUpTask, ClickUpTaskCustomField } from './ClickUpTask';
import type { PatientStatus } from '../../../case/domain/enums/PatientStatus';

type CustomFieldMap = Record<string, unknown>;

export interface VacancyUpsertInput {
  /** Número do caso clínico (manual, do custom field "Caso Número"). */
  caseNumber: number;
  /** ID da task ClickUp — é o mesmo do paciente (1 task = 1 paciente = N vagas). */
  clickupTaskId: string;
  /** O mesmo que clickupTaskId: a task é pai do próprio paciente. */
  patientClickupTaskId: string;
  /** Canonical patient status derived from ClickUp status (migration 143). */
  patientStatus: PatientStatus | null;
  /** Canonical job_posting status derived from ClickUp status. */
  jobPostingStatus: string | null;
  /** Formatted address (Google Maps style), from "Domicilio N Principal Paciente". */
  serviceAddressFormatted: string | null;
  /** Raw address text typed by operator, from "Domicilio Informado Paciente N". */
  serviceAddressRaw: string | null;
  /**
   * Structured schedule — intentionally null in v1.
   * Text is preserved in scheduleDaysHours for future LLM enrichment.
   * migration 107 already prepared job_postings.schedule JSONB column.
   */
  schedule: Record<string, unknown> | null;
  /** Raw text from "Días y Horarios de Acompañamiento". */
  scheduleDaysHours: string | null;
  /** "Perfil del Prestador Buscado" free text. */
  workerProfileSought: string | null;
  /** "Período Autorizado" parsed as Date. */
  dueDate: Date | null;
  /** "Inicio Búsqueda" parsed as Date. */
  searchStartDate: Date | null;
}

export class ClickUpVacancyMapper {
  /**
   * Maps a ClickUp task to a list of VacancyUpsertInput.
   * Returns [] if task is a subtask or has no Caso Número.
   */
  map(task: ClickUpTask): VacancyUpsertInput[] {
    // Skip subtasks
    if (task.parent !== null) return [];

    const cf = this.buildCustomFieldMap(task.custom_fields);

    // "Caso Número" is mandatory — skip if missing
    const caseNumber = this.asNumber(cf['Caso Número']);
    if (caseNumber === null) return [];

    const statusMapping = mapClickUpVacancyStatus(task.status?.status ?? null);

    // admisión → jobPostingStatus is null: patient exists but no vacancy yet.
    // Return [] so the vacancy sync loop skips this task entirely.
    if (statusMapping?.jobPostingStatus === null) return [];

    const patientStatus    = statusMapping?.patientStatus    ?? null;
    const jobPostingStatus = statusMapping?.jobPostingStatus ?? null;

    const scheduleDaysHours = this.asString(cf['Días y Horarios de Acompañamiento']);
    const workerProfileSought = this.asString(cf['Perfil del Prestador Buscado']);
    const dueDate        = this.parseDate(this.asString(cf['Período Autorizado']));
    const searchStartDate = this.parseDate(this.asString(cf['Inicio Búsqueda']));

    const base = {
      caseNumber,
      clickupTaskId:       task.id,
      patientClickupTaskId: task.id,
      patientStatus,
      jobPostingStatus,
      schedule:            null, // v1: always null — LLM enrichment later
      scheduleDaysHours,
      workerProfileSought,
      dueDate,
      searchStartDate,
    };

    // Address slots: Dom1, Dom2, Dom3
    const slots = [
      {
        location: cf['Domicilio 1 Principal Paciente'],
        raw:      this.asString(cf['Domicilio Informado Paciente 1']),
      },
      {
        location: cf['Domicilio 2 Principal Paciente'],
        raw:      this.asString(cf['Domicilio Informado Paciente 2']),
      },
      {
        location: cf['Domicilio 3 Principal Paciente'],
        raw:      this.asString(cf['Domicilio Informado Paciente 3']),
      },
    ];

    const filled = slots.filter(s =>
      this.extractFormattedAddress(s.location) !== null || s.raw !== null,
    );

    if (filled.length === 0) {
      // No address filled: still emit one vacancy entry (vacancy without address is valid)
      return [{
        ...base,
        serviceAddressFormatted: null,
        serviceAddressRaw:       null,
      }];
    }

    return filled.map(s => ({
      ...base,
      serviceAddressFormatted: this.extractFormattedAddress(s.location),
      serviceAddressRaw:       s.raw,
    }));
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private buildCustomFieldMap(fields: ClickUpTaskCustomField[]): CustomFieldMap {
    const map: CustomFieldMap = {};
    for (const field of fields) {
      map[field.name] = field.value;
    }
    return map;
  }

  private asString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    // Operators sometimes type literal "null" when slot is empty
    if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
    return trimmed;
  }

  private asNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    // ClickUp dates may be epoch ms (numeric string) or ISO strings
    const asNum = Number(value);
    if (!Number.isNaN(asNum) && asNum > 1_000_000_000) {
      return new Date(asNum);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private extractFormattedAddress(location: unknown): string | null {
    if (!location || typeof location !== 'object') return null;
    const loc = location as Record<string, unknown>;
    const formatted = loc['formatted_address'];
    if (typeof formatted !== 'string') return null;
    const trimmed = formatted.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
    return trimmed;
  }
}
