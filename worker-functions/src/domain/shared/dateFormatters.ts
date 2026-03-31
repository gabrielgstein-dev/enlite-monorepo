/**
 * Formata datetime ISO para data legível (dd/MM) usando UTC.
 */
export function formatDateUTC(datetime: string | Date): string {
  const d = new Date(datetime);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Formata datetime ISO para hora legível (HH:mm) usando UTC.
 */
export function formatTimeUTC(datetime: string | Date): string {
  const d = new Date(datetime);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}
