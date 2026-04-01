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

/**
 * Gera todas as variantes de formato de um número de telefone
 * que podem estar armazenadas no banco de dados.
 *
 * O banco pode ter números em formatos históricos variados:
 *   - 549XXXXXXXXXX (13 dígitos, canônico Buenos Aires)
 *   - 549XXXXXXXXX  (12 dígitos, canônico interior)
 *   - XXXXXXXXXX    (10 dígitos, local Buenos Aires sem prefixo)
 *   - 54XXXXXXXXXX  (12 dígitos, sem o 9 do móvel)
 *   - Os dígitos exatos como foram digitados (fallback)
 *
 * Retorna array de candidatos únicos para uso em WHERE phone = ANY($1).
 */
export function generatePhoneCandidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return [];

  const candidates = new Set<string>();
  candidates.add(digits); // inclui sempre os dígitos exatos (fallback)

  const canonical = normalizePhoneAR(digits);
  if (canonical) candidates.add(canonical);

  // Para canonical de 13 dígitos (formato Buenos Aires: 549XXXXXXXXXX)
  if (canonical.length === 13 && canonical.startsWith('549')) {
    const local = canonical.slice(3);       // 10 dígitos: XXXXXXXXXX
    candidates.add(local);
    candidates.add('54' + local);           // 12 dígitos: 54XXXXXXXXXX (sem o 9)
  }

  // Para canonical de 12 dígitos (formato interior: 549XXXXXXXXX)
  if (canonical.length === 12 && canonical.startsWith('549')) {
    const local = canonical.slice(3);       // 9 dígitos
    candidates.add(local);
    candidates.add('54' + local);           // 11 dígitos: 54XXXXXXXXX
  }

  // Filtra candidatos muito curtos (ruído)
  return Array.from(candidates).filter(c => c.length >= 7);
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
  // ClickUp exports empty fields as the literal string "null"
  if (s === '' || s.toLowerCase() === 'null') return null;
  return s;
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
 * Classifica profession em categorias padronizadas: AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST
 * Usa pattern matching simples para casos comuns.
 * Valores legacy (CARER, STUDENT, BOTH) são mapeados para o novo enum.
 */
export function classifyProfession(rawProfession: string | null | undefined): string | null {
  if (!rawProfession) return null;

  const normalized = rawProfession.toLowerCase().trim();
  
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

  // Cuidador → CAREGIVER
  if (
    normalized.includes('cuidador') ||
    normalized.includes('cuidar') ||
    normalized.includes('carer') ||
    normalized.includes('caregiver') ||
    normalized.includes('asistente')
  ) {
    return 'CAREGIVER';
  }

  // Enfermeiro → NURSE
  if (
    normalized.includes('enferm') ||
    normalized.includes('nurse') ||
    normalized.includes('matricula')
  ) {
    return 'NURSE';
  }

  // Kinesiólogo → KINESIOLOGIST
  if (
    normalized.includes('kinesio') ||
    normalized.includes('fisio') ||
    normalized.includes('kinesiologist')
  ) {
    return 'KINESIOLOGIST';
  }

  // Psicólogo → PSYCHOLOGIST
  if (
    normalized.includes('psicolog') ||
    normalized.includes('psycholog') ||
    normalized.includes('terapeuta')
  ) {
    return 'PSYCHOLOGIST';
  }

  // Legacy: BOTH/AMBOS → null (não existe mais no enum)
  if (
    normalized.includes('ambos') ||
    normalized.includes('both') ||
    normalized.includes('los dos')
  ) {
    return null;
  }

  // Legacy: STUDENT → null (não existe mais no enum; psicólogos já são cobertos acima)
  if (
    normalized.includes('estudiant') ||
    normalized.includes('student') ||
    normalized.includes('avanzad') ||
    normalized.includes('carrera')
  ) {
    return null;
  }
  
  // Casos especiais: "Sí", "Si", "X" -> retorna null (precisa de contexto adicional)
  if (normalized === 'si' || normalized === 'sí' || normalized === 'x' || normalized === 's') {
    return null;
  }
  
  // Se não conseguiu classificar, retorna null ao invés do valor original
  // para evitar violação do constraint valid_profession_values
  return null;
}
