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

/**
 * Normaliza telefones argentinos para o formato canônico 549XXXXXXXXXX.
 *
 * Regras (baseadas nos dados reais das planilhas):
 *   10 dígitos  → falta prefixo país+móvel → prepend '549'
 *                 ex: 1151265663 → 5491151265663
 *   11 dígitos começando com '54' → falta o '9' do móvel → insert '9' depois de '54'
 *                 ex: 54111265663 → 549111265663
 *   12 dígitos começando com '54' mas não '549' → mesmo caso
 *                 ex: 541151265663 → 5491151265663
 *   13 dígitos começando com '549' → já correto
 *   Outros (8, 9, 14+) → strip only, retorna como está (formato incomum/erro de dado)
 */
export function normalizePhoneAR(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    return '549' + digits;
  }
  if (digits.length === 11 && digits.startsWith('54')) {
    // ex: 54111265663 → 549 + 111265663
    return '549' + digits.slice(2);
  }
  if (digits.length === 12 && digits.startsWith('54') && !digits.startsWith('549')) {
    // ex: 541151265663 → 549 + 1151265663
    return '549' + digits.slice(2);
  }
  if (digits.length === 13 && digits.startsWith('549')) {
    return digits; // já correto
  }

  // Comprimentos incomuns (8, 9, 14+): retorna dígitos sem formatação
  return digits;
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
  // IMPORTANTE: substituições específicas ANTES do replace de espaços,
  // caso contrário 'NO ACEPTA' vira 'NO_ACEPTA' e nunca casa com 'NO ACEPTA'.
  const normalized = raw.toString().trim().toUpperCase()
    .replace('AT NO ACEPTA', 'AT_NO_ACEPTA')   // deve vir antes de 'NO ACEPTA'
    .replace('NO ACEPTA', 'AT_NO_ACEPTA')
    .replace(/\s+/g, '_');                      // espaços restantes → underscore

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

/**
 * Normaliza email: lowercase + trim
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = String(email).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/**
 * Normaliza nome próprio: trim + capitalize primeira letra de cada palavra
 */
export function normalizeProperName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Gera auth_uid seguro usando hash MD5 de phone+email para evitar expor PII
 * Formato: {source}_{hash8chars}
 */
export function generateSecureAuthUid(source: string, phone: string | null, email: string | null): string {
  const identifier = phone || email || 'unknown';
  const hash = crypto.createHash('md5').update(identifier).digest('hex').substring(0, 8);
  return `${source}_${hash}`;
}

/**
 * Classifica profession em categorias padronizadas: AT, CARER, STUDENT, BOTH, ou retorna original
 * Usa pattern matching simples para casos comuns
 */
export function classifyProfession(rawProfession: string | null | undefined): string | null {
  if (!rawProfession) return null;
  
  const normalized = rawProfession.toLowerCase().trim();
  
  // BOTH - Ambos (AT e Cuidador)
  if (
    normalized.includes('ambos') ||
    normalized.includes('both') ||
    normalized.includes('los dos') ||
    (normalized.includes('acompañante') && normalized.includes('cuidador')) ||
    (normalized.includes('at') && normalized.includes('cuidador'))
  ) {
    return 'BOTH';
  }
  
  // Acompanhante Terapêutico (AT)
  if (
    normalized.includes('acompañante') ||
    normalized.includes('acompanante') ||
    normalized.includes('terapeutic') ||
    normalized.includes('at ') ||
    normalized === 'at' ||
    normalized.includes('con certificado') ||
    normalized.includes('certificad')
  ) {
    return 'AT';
  }
  
  // Cuidador
  if (
    normalized.includes('cuidador') ||
    normalized.includes('cuidar') ||
    normalized.includes('carer')
  ) {
    return 'CARER';
  }
  
  // Estudante
  if (
    normalized.includes('estudiant') ||
    normalized.includes('student') ||
    normalized.includes('psicolog') ||
    normalized.includes('avanzad') ||
    normalized.includes('carrera')
  ) {
    return 'STUDENT';
  }
  
  // Casos especiais: "Sí", "Si", "X" -> retorna null (precisa de contexto adicional)
  if (normalized === 'si' || normalized === 'sí' || normalized === 'x' || normalized === 's') {
    return null;
  }
  
  // Se não conseguiu classificar, retorna null ao invés do valor original
  // para evitar violação do constraint valid_profession_values
  return null;
}
