export interface ScheduleValue {
  days: string[];
  timeFrom: string;
  timeTo: string;
}

export const DAY_KEYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
export type DayKey = typeof DAY_KEYS[number];

export const DAY_LABELS: Record<DayKey, string> = {
  lun: 'Lunes',
  mar: 'Martes',
  mie: 'Miércoles',
  jue: 'Jueves',
  vie: 'Viernes',
  sab: 'Sábado',
  dom: 'Domingo',
};

const LABEL_TO_KEY: Record<string, DayKey> = {
  lunes: 'lun',
  martes: 'mar',
  miércoles: 'mie',
  miercoles: 'mie',
  jueves: 'jue',
  viernes: 'vie',
  sábado: 'sab',
  sabado: 'sab',
  domingo: 'dom',
};

/**
 * Tenta parsear uma string no formato "Lunes, Martes 09:00-17:00"
 * em um ScheduleValue. Retorna null se não conseguir parsear.
 */
export function parseScheduleString(raw: string): ScheduleValue | null {
  if (!raw) return null;

  const timeMatch = raw.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
  if (!timeMatch) return null;

  const timeFrom = timeMatch[1].padStart(5, '0');
  const timeTo = timeMatch[2].padStart(5, '0');

  const daysPart = raw
    .replace(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/, '')
    .trim()
    .replace(/,$/, '');

  const days: string[] = daysPart
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .map((d) => LABEL_TO_KEY[d])
    .filter(Boolean);

  if (days.length === 0) return null;

  return { days, timeFrom, timeTo };
}

/**
 * Serializa um ScheduleValue para a string que vai ao backend.
 * Ex: "Lunes, Martes, Miércoles 09:00-17:00"
 */
export function serializeSchedule(value: ScheduleValue): string {
  if (value.days.length === 0 || !value.timeFrom || !value.timeTo) return '';
  const dayNames = value.days.map((k) => DAY_LABELS[k as DayKey] ?? k).join(', ');
  return `${dayNames} ${value.timeFrom}-${value.timeTo}`;
}
