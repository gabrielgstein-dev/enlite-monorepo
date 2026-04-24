import * as crypto from 'crypto';
import { z } from 'zod';
import { ClickUpFieldResolver } from './ClickUpFieldResolver';
import type { ClickUpTask, ClickUpTaskCustomField } from './ClickUpTask';
import { mapClickUpGender } from './mappings/genderMap';
import { mapClickUpProfession } from './mappings/professionMap';
import type { EncuadreResultado } from '@modules/matching/domain/Encuadre';
import type { Profession } from '@modules/worker/domain/enums/Profession';
import type { Gender } from '@modules/worker/domain/enums/Gender';

// ── Zod schemas for input validation at the boundary ─────────────────────────

const CustomFieldSchema = z.object({
  id:    z.string(),
  name:  z.string(),
  type:  z.string(),
  value: z.unknown().optional(),
});

const TaskStatusSchema = z.object({
  status: z.string(),
  color:  z.string().optional(),
  type:   z.string().optional(),
});

export const ClickUpTaskSchema = z.object({
  id:            z.string(),
  name:          z.string(),
  status:        TaskStatusSchema,
  parent:        z.string().nullable(),
  custom_fields: z.array(CustomFieldSchema),
  url:           z.string().optional(),
  date_created:  z.string().optional(),
  date_updated:  z.string().optional(),
});

// ── Output types ──────────────────────────────────────────────────────────────

export interface EncuadreWorkerData {
  email:        string | null;
  phone:        string | null;   // normalized E.164 (or best-effort)
  rawWhatsapp:  string | null;   // original raw value from ClickUp
  firstName:    string | null;
  lastName:     string | null;
  birthDate:    Date | null;
  gender:       Gender | null;   // gender identity from "Sexo Prestador" (Admisiones)
  profession:   Profession | null;
}

export interface EncuadreData {
  clickupTaskId: string;
  caseNumber:    number | null;
  rawName:       string | null;
  rawPhone:      string | null;
  resultado:     EncuadreResultado;
  origen:        string;           // always 'ClickUp'
  dedupHash:     string;           // MD5('clickup|{taskId}')
}

export interface EncuadreMapperOutput {
  worker:   EncuadreWorkerData;
  encuadre: EncuadreData;
}

type CustomFieldMap = Record<string, unknown>;

// ── Status → resultado mapping ────────────────────────────────────────────────

const STATUS_TO_RESULTADO: Record<string, EncuadreResultado> = {
  'admitido':    'SELECCIONADO', // ClickUp: "admitido"
  'no admitido': 'RECHAZADO',   // ClickUp: "no admitido"
};

function mapStatusToResultado(status: string): EncuadreResultado {
  const lower = status.toLowerCase().trim();
  return STATUS_TO_RESULTADO[lower] ?? 'PENDIENTE';
}

// ── Mapper class ──────────────────────────────────────────────────────────────

/**
 * ClickUpEncuadreMapper — converts a ClickUp task from the "Admisiones" list
 * into { worker, encuadre } data ready for DB upsert.
 *
 * Returns null if the task has neither email nor whatsapp (non-identifiable worker).
 */
export class ClickUpEncuadreMapper {
  constructor(private readonly resolver: ClickUpFieldResolver) {}

  map(task: ClickUpTask): EncuadreMapperOutput | null {
    // Validate task shape at the boundary
    const parsed = ClickUpTaskSchema.safeParse(task);
    if (!parsed.success) return null;

    const cf = this.buildCfMap(parsed.data.custom_fields);

    const email      = this.asString(cf['Email Prestador']);
    const rawWhatsapp = this.asString(cf['Whatsapp Prestador']);

    // Skip non-identifiable workers (no email AND no whatsapp)
    if (!email && !rawWhatsapp) return null;

    // Resolve dropdown fields
    const sexLabel        = this.resolver.resolveDropdown('Sexo Prestador', this.asIndexable(cf['Sexo Prestador']));
    const professionLabel = this.resolver.resolveDropdown('Tipo de Profesional', this.asIndexable(cf['Tipo de Profesional']));

    // Parse name from "Apellido y Nombre Prestador" field
    const { firstName, lastName } = this.parseName(this.asString(cf['Apellido y Nombre Prestador']));

    // Case number — NUMBER field from ClickUp
    const caseNumber = this.asNumber(cf['Caso Número']);

    // dedup_hash: MD5('clickup|{taskId}')
    const dedupHash = crypto.createHash('md5')
      .update(`clickup|${task.id}`)
      .digest('hex');

    const worker: EncuadreWorkerData = {
      email,
      phone:      rawWhatsapp,  // raw; normalization happens in the script
      rawWhatsapp,
      firstName,
      lastName,
      birthDate:  this.parseDate(this.asString(cf['Fecha Nacimiento Prestador'])),
      gender:     mapClickUpGender(sexLabel),
      profession: mapClickUpProfession(professionLabel),
    };

    const encuadre: EncuadreData = {
      clickupTaskId: task.id,
      caseNumber,
      rawName:       this.asString(cf['Apellido y Nombre Prestador']),
      rawPhone:      rawWhatsapp,
      resultado:     mapStatusToResultado(task.status.status),
      origen:        'ClickUp',
      dedupHash,
    };

    return { worker, encuadre };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private buildCfMap(fields: readonly ClickUpTaskCustomField[]): CustomFieldMap {
    const map: CustomFieldMap = {};
    for (const field of fields) {
      map[field.name] = field.value;
    }
    return map;
  }

  /**
   * Parses "Apellido y Nombre" string (common formats):
   *   "García, Juan"         → { lastName: "García", firstName: "Juan" }
   *   "GARCÍA JUAN"          → { lastName: "GARCÍA", firstName: "JUAN" } (best effort)
   *   "Juan García"          → { lastName: null,     firstName: "Juan García" } (fallback)
   */
  private parseName(raw: string | null): { firstName: string | null; lastName: string | null } {
    if (!raw) return { firstName: null, lastName: null };
    const trimmed = raw.trim();
    if (!trimmed) return { firstName: null, lastName: null };

    const commaParts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      return { lastName: commaParts[0], firstName: commaParts.slice(1).join(' ') };
    }

    // No comma — treat full value as firstName, lastName null
    return { firstName: trimmed, lastName: null };
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private asString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim() || null;
    return null;
  }

  private asIndexable(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private asNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
}
