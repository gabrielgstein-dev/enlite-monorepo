import * as crypto from 'crypto';

export function hashEncuadre(fields: {
  caseNumber: number | string | null;
  workerPhone: string | null;
  workerName: string | null;
  interviewDate: string | null;
  interviewTime: string | null;
  recruitmentDate: string | null;
}): string {
  const normalized = [
    String(fields.caseNumber ?? ''),
    normalizePhone(fields.workerPhone),
    normalizeName(fields.workerName),
    String(fields.interviewDate ?? ''),
    String(fields.interviewTime ?? ''),
    String(fields.recruitmentDate ?? ''),
  ].join('|');

  return crypto.createHash('md5').update(normalized).digest('hex');
}

export function hashPublication(fields: {
  caseNumber: number | string | null;
  channel: string | null;
  groupName: string | null;
  publishedAt: string | null;
  recruiterName: string | null;
}): string {
  const normalized = [
    String(fields.caseNumber ?? ''),
    String(fields.channel ?? '').toLowerCase().trim(),
    String(fields.groupName ?? '').toLowerCase().trim(),
    String(fields.publishedAt ?? ''),
    String(fields.recruiterName ?? '').toLowerCase().trim(),
  ].join('|');

  return crypto.createHash('md5').update(normalized).digest('hex');
}

export function hashFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`);
    return isNaN(d.getTime()) ? null : d;
  }

  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function parseExcelDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') return parseDate(value);
  return null;
}

export function normalizeResultado(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toString().trim().toUpperCase()
    .replace(/\s+/g, '_')
    .replace('AT NO ACEPTA', 'AT_NO_ACEPTA')
    .replace('NO ACEPTA', 'AT_NO_ACEPTA');

  const valid = ['SELECCIONADO','RECHAZADO','AT_NO_ACEPTA','REPROGRAMAR','REEMPLAZO','BLACKLIST','PENDIENTE'];
  return valid.includes(normalized) ? normalized : null;
}

export function normalizeBoolean(raw: unknown): boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (['si', 'sí', 's', 'yes', 'y', '1', 'true', 'x'].includes(s)) return true;
  if (['no', 'n', '0', 'false', '-'].includes(s)) return false;
  return null;
}

export function cleanString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}
