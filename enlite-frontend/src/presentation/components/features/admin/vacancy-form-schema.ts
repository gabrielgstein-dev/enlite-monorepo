import { z } from 'zod';
import type { ScheduleValue } from './vacancyScheduleUtils';
import { parseScheduleString } from './vacancyScheduleUtils';

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

export const vacancyFormSchema = z
  .object({
    title: z.string().min(3),
    status: z.string().optional(),
    required_professions: z.array(z.string()).min(1),
    required_sex: z.string().optional(),
    age_range_min: z.number().min(18).optional(),
    age_range_max: z.number().optional(),
    required_experience: z.string().optional(),
    worker_attributes: z.string().optional(),
    providers_needed: z.number({ invalid_type_error: 'required' }).min(1),
    state: z.string().min(1),
    city: z.string().min(2),
    service_device_types: z.array(z.string()).min(1),
    work_schedule: z.string().optional(),
    schedule: z
      .array(z.object({ days: z.array(z.string()).min(1), timeFrom: z.string().min(1), timeTo: z.string().min(1) }))
      .min(1),
    pathology_types: z.string().optional(),
    dependency_level: z.string().optional(),
    salary_text: z.string().optional(),
    payment_day: z.string().optional(),
    daily_obs: z.string().optional(),
  })
  .refine(
    (d) => !(d.age_range_min !== undefined && d.age_range_max !== undefined && d.age_range_max < d.age_range_min),
    { message: 'ageRangeInvalid', path: ['age_range_max'] },
  );

export type VacancyFormData = z.infer<typeof vacancyFormSchema>;

// ---------------------------------------------------------------------------
// Option constants
// ---------------------------------------------------------------------------

export const STATUS_OPTIONS = ['BUSQUEDA', 'REEMPLAZO', 'CUBIERTO', 'CANCELADO'] as const;

export const PROFESSION_OPTIONS = ['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'] as const;

export const SEX_OPTIONS = ['M', 'F', 'BOTH'] as const;

export const DEVICE_OPTIONS = [
  'DOMICILIARIO', 'ESCOLAR', 'INSTITUCIONAL', 'COMUNITARIO',
  'AMBULATORIO', 'INTERNACION', 'RESIDENCIAL', 'TRASLADO',
] as const;

export const DEPENDENCY_OPTIONS = ['Leve', 'Moderado', 'Grave', 'Alto', 'Muy Grave'] as const;

export const WORK_SCHEDULE_OPTIONS = ['full-time', 'part-time', 'flexible'] as const;

export const PROVINCE_OPTIONS = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
] as const;

// ---------------------------------------------------------------------------
// Schedule conversion: SchedulePicker ↔ Backend JSONB
// ---------------------------------------------------------------------------

export interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_KEY_TO_NUM: Record<string, number> = {
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
};
const NUM_TO_DAY_KEY: Record<number, string> = {
  0: 'dom', 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab',
};

/** SchedulePicker value → backend JSONB array */
export function scheduleToJsonb(value: ScheduleValue): ScheduleSlot[] {
  const result: ScheduleSlot[] = [];
  for (const entry of value) {
    if (!entry.days.length || !entry.timeFrom || !entry.timeTo) continue;
    for (const day of entry.days) {
      result.push({ dayOfWeek: DAY_KEY_TO_NUM[day] ?? 1, startTime: entry.timeFrom, endTime: entry.timeTo });
    }
  }
  return result;
}

/** Backend JSONB array → SchedulePicker value */
export function jsonbToSchedule(slots: ScheduleSlot[] | null): ScheduleValue {
  if (!slots || slots.length === 0) return [{ days: [], timeFrom: '', timeTo: '' }];
  const groups = new Map<string, string[]>();
  for (const s of slots) {
    const key = `${s.startTime}|${s.endTime}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(NUM_TO_DAY_KEY[s.dayOfWeek] ?? 'lun');
  }
  return Array.from(groups.entries()).map(([key, days]) => {
    const [timeFrom, timeTo] = key.split('|');
    return { days, timeFrom, timeTo };
  });
}

const EMPTY_SCHEDULE: ScheduleValue = [{ days: [], timeFrom: '', timeTo: '' }];

/** Build ScheduleValue from vacancy object (prefers JSONB, falls back to legacy text) */
export function buildScheduleFromVacancy(vacancy: any): ScheduleValue {
  if (vacancy.schedule && Array.isArray(vacancy.schedule) && vacancy.schedule.length > 0) {
    return jsonbToSchedule(vacancy.schedule);
  }
  if (vacancy.schedule_days_hours) {
    return parseScheduleString(vacancy.schedule_days_hours) ?? EMPTY_SCHEDULE;
  }
  return EMPTY_SCHEDULE;
}

// ---------------------------------------------------------------------------
// Build API payload from form data
// ---------------------------------------------------------------------------

export function buildVacancyPayload(data: VacancyFormData, caseNumber: number | null) {
  const jsonb = scheduleToJsonb(data.schedule);
  return {
    case_number: caseNumber,
    title: data.title,
    patient_id: null,
    required_professions: data.required_professions,
    required_sex: data.required_sex || null,
    age_range_min: data.age_range_min ?? null,
    age_range_max: data.age_range_max ?? null,
    required_experience: data.required_experience || null,
    worker_attributes: data.worker_attributes || null,
    schedule: jsonb.length > 0 ? jsonb : null,
    work_schedule: data.work_schedule || null,
    pathology_types: data.pathology_types || null,
    dependency_level: data.dependency_level || null,
    service_device_types: data.service_device_types,
    providers_needed: data.providers_needed,
    salary_text: data.salary_text || 'A convenir',
    payment_day: data.payment_day || null,
    daily_obs: data.daily_obs || null,
    city: data.city,
    state: data.state,
    status: data.status,
  };
}

// ---------------------------------------------------------------------------
// Default form values
// ---------------------------------------------------------------------------

export const DEFAULT_FORM_VALUES: VacancyFormData = {
  title: '',
  status: 'BUSQUEDA',
  required_professions: [],
  required_sex: '',
  age_range_min: undefined,
  age_range_max: undefined,
  required_experience: '',
  worker_attributes: '',
  providers_needed: 1,
  state: '',
  city: '',
  service_device_types: [],
  work_schedule: '',
  schedule: [{ days: [], timeFrom: '', timeTo: '' }],
  pathology_types: '',
  dependency_level: '',
  salary_text: '',
  payment_day: '',
  daily_obs: '',
};
