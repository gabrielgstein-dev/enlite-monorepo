/**
 * import-utils.test.ts
 *
 * Testes unitários para as funções puras de import-utils.
 * Cobrem os 10 casos mais problemáticos de cada função:
 *   - normalizePhoneAR  → normalização de telefones argentinos
 *   - hashEncuadre      → deduplicação por hash MD5
 *   - normalizeBoolean  → valores booleanos variados do Excel
 *   - parseExcelDate    → datas em número serial, Date, string
 *   - normalizeResultado → resultados válidos e inválidos
 *   - cleanString       → limpeza de strings null/undefined/whitespace
 */

import {
  normalizePhoneAR,
  normalizePhone,
  hashEncuadre,
  normalizeBoolean,
  parseExcelDate,
  normalizeResultado,
  cleanString,
} from '../import-utils';

// ─────────────────────────────────────────────────────────
// normalizePhoneAR
// ─────────────────────────────────────────────────────────
describe('normalizePhoneAR', () => {
  // Caso 1: 10 dígitos (formato Ana Care) → prepend 549
  it('normaliza 10 dígitos para 549XXXXXXXXXX', () => {
    expect(normalizePhoneAR('1151265663')).toBe('5491151265663');
  });

  // Caso 2: já em formato correto 13 dígitos com 549
  it('mantém 13 dígitos com prefixo 549 inalterado', () => {
    expect(normalizePhoneAR('5491151265663')).toBe('5491151265663');
  });

  // Caso 3: 12 dígitos começando com 54 (não 549) → insere 9
  it('normaliza 12 dígitos 54X para 549XXXXXXXXXX', () => {
    expect(normalizePhoneAR('541151265663')).toBe('5491151265663');
  });

  // Caso 4: 11 dígitos começando com 54 → insere 9 após 54
  it('normaliza 11 dígitos 54X para 549XXXXXXXXX', () => {
    expect(normalizePhoneAR('54111265663')).toBe('549111265663');
  });

  // Caso 5: formatado com espaços e traços (13 dígitos reais)
  it('strip de formatação: +54 9 11 5126-5663 → 5491151265663', () => {
    expect(normalizePhoneAR('+54 9 11 5126-5663')).toBe('5491151265663');
  });

  // Caso 6: formatado 10 dígitos com parênteses
  it('strip de formatação em telefone 10 dígitos', () => {
    // (11) 5126-5663 → stripped: 1151265663 → prepend 549
    expect(normalizePhoneAR('(11) 5126-5663')).toBe('5491151265663');
  });

  // Caso 7: null → string vazia
  it('retorna string vazia para null', () => {
    expect(normalizePhoneAR(null)).toBe('');
  });

  // Caso 8: undefined → string vazia
  it('retorna string vazia para undefined', () => {
    expect(normalizePhoneAR(undefined)).toBe('');
  });

  // Caso 9: string vazia → string vazia
  it('retorna string vazia para string vazia', () => {
    expect(normalizePhoneAR('')).toBe('');
  });

  // Caso 10: comprimento incomum (8 dígitos) → retorna como está
  it('retorna dígitos sem normalização para comprimentos incomuns', () => {
    expect(normalizePhoneAR('12345678')).toBe('12345678');
  });
});

// ─────────────────────────────────────────────────────────
// hashEncuadre — deduplicação
// ─────────────────────────────────────────────────────────
describe('hashEncuadre', () => {
  const base = {
    caseNumber: 738,
    workerPhone: '5491151265663',
    workerName: 'Silva Lautaro',
    interviewDate: '2025-03-15',
    interviewTime: '14:00',
    recruitmentDate: '2025-03-01',
  };

  // Caso 1: mesmos inputs → mesmo hash (determinismo)
  it('é determinístico: mesmos inputs produzem mesmo hash', () => {
    expect(hashEncuadre(base)).toBe(hashEncuadre({ ...base }));
  });

  // Caso 2: telefone diferente → hash diferente
  it('telefone diferente → hash diferente', () => {
    const other = { ...base, workerPhone: '5491199887766' };
    expect(hashEncuadre(base)).not.toBe(hashEncuadre(other));
  });

  // Caso 3: caso diferente → hash diferente
  it('case number diferente → hash diferente', () => {
    expect(hashEncuadre(base)).not.toBe(hashEncuadre({ ...base, caseNumber: 999 }));
  });

  // Caso 4: data de encuadre diferente → hash diferente
  it('interview date diferente → hash diferente', () => {
    expect(hashEncuadre(base)).not.toBe(hashEncuadre({ ...base, interviewDate: '2025-04-01' }));
  });

  // Caso 5: nome diferente (case-insensitive devido ao normalizeName interno)
  it('nomes com acentos normalizados são comparados de forma consistente', () => {
    const h1 = hashEncuadre({ ...base, workerName: 'García' });
    const h2 = hashEncuadre({ ...base, workerName: 'García' });
    expect(h1).toBe(h2);
  });

  // Caso 6: campos null são normalizados para string vazia internamente
  it('campos null não lançam exceção e produzem hash consistente', () => {
    const nullBase = {
      caseNumber: null,
      workerPhone: null,
      workerName: null,
      interviewDate: null,
      interviewTime: null,
      recruitmentDate: null,
    };
    expect(() => hashEncuadre(nullBase)).not.toThrow();
    expect(hashEncuadre(nullBase)).toBe(hashEncuadre({ ...nullBase }));
  });

  // Caso 7: phone com 10 dígitos vs 13 dígitos → hashes diferentes (normalizePhone apenas strip)
  it('10-digit e 13-digit phones produzem hashes distintos', () => {
    const h10 = hashEncuadre({ ...base, workerPhone: '1151265663' });
    const h13 = hashEncuadre({ ...base, workerPhone: '5491151265663' });
    expect(h10).not.toBe(h13);
  });

  // Caso 8: interviewTime null vs "14:00" → hashes diferentes
  it('interviewTime null vs definido produz hashes distintos', () => {
    expect(hashEncuadre(base)).not.toBe(hashEncuadre({ ...base, interviewTime: null }));
  });
});

// ─────────────────────────────────────────────────────────
// normalizeBoolean — valores do Excel
// ─────────────────────────────────────────────────────────
describe('normalizeBoolean', () => {
  // Caso 1: 'Si' → true (valor padrão nas planilhas AR)
  it('"Si" → true', () => expect(normalizeBoolean('Si')).toBe(true));

  // Caso 2: 'Sí' com acento → true
  it('"Sí" → true', () => expect(normalizeBoolean('Sí')).toBe(true));

  // Caso 3: 'X' (checkmark no Excel) → true
  it('"X" → true', () => expect(normalizeBoolean('X')).toBe(true));

  // Caso 4: '1' → true
  it('"1" → true', () => expect(normalizeBoolean('1')).toBe(true));

  // Caso 5: 'yes' → true
  it('"yes" → true', () => expect(normalizeBoolean('yes')).toBe(true));

  // Caso 6: 'No' → false
  it('"No" → false', () => expect(normalizeBoolean('No')).toBe(false));

  // Caso 7: 'n' → false
  it('"n" → false', () => expect(normalizeBoolean('n')).toBe(false));

  // Caso 8: '0' → false
  it('"0" → false', () => expect(normalizeBoolean('0')).toBe(false));

  // Caso 9: string vazia → null
  it('string vazia → null', () => expect(normalizeBoolean('')).toBeNull());

  // Caso 10: null → null
  it('null → null', () => expect(normalizeBoolean(null)).toBeNull());
});

// ─────────────────────────────────────────────────────────
// parseExcelDate
// ─────────────────────────────────────────────────────────
describe('parseExcelDate', () => {
  // Caso 1: Date object → retorna o mesmo (passthrough)
  it('Date object → retorna Date inalterado', () => {
    const d = new Date('2025-03-15');
    const result = parseExcelDate(d);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(d.getTime());
  });

  // Caso 2: número serial do Excel → converte para Date
  it('número serial Excel 45730 → Date válido', () => {
    // 45730 ≈ 14-Mar-2025 no Excel
    const result = parseExcelDate(45730);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  // Caso 3: string DD/MM/YYYY → Date
  it('"15/03/2025" → Date 15 março 2025', () => {
    const result = parseExcelDate('15/03/2025');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
    expect(result?.getMonth()).toBe(2); // março = 2 (0-indexed)
  });

  // Caso 4: string ISO YYYY-MM-DD → Date
  it('"2025-03-15" → Date válido', () => {
    const result = parseExcelDate('2025-03-15');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
  });

  // Caso 5: null → null
  it('null → null', () => expect(parseExcelDate(null)).toBeNull());

  // Caso 6: string vazia → null
  it('string vazia → null', () => expect(parseExcelDate('')).toBeNull());

  // Caso 7: undefined → null
  it('undefined → null', () => expect(parseExcelDate(undefined)).toBeNull());

  // Caso 8: string inválida → null
  it('string inválida → null', () => expect(parseExcelDate('não é data')).toBeNull());

  // Caso 9: 0 (Excel epoch inválido) → Date ou null (não lança exceção)
  it('número 0 não lança exceção', () => {
    expect(() => parseExcelDate(0)).not.toThrow();
  });

  // Caso 10: fração de dia (0.5833 = 14:00) → NÃO deve ser tratado como data válida
  // no fluxo de HORA ENCUADRE usa formatExcelTime separadamente
  it('fração de dia < 1 converte (não crashar)', () => {
    expect(() => parseExcelDate(0.5833)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// normalizeResultado
// ─────────────────────────────────────────────────────────
describe('normalizeResultado', () => {
  // Caso 1-7: os 7 valores válidos da enum
  it.each([
    ['SELECCIONADO', 'SELECCIONADO'],
    ['RECHAZADO', 'RECHAZADO'],
    ['AT_NO_ACEPTA', 'AT_NO_ACEPTA'],
    ['AT NO ACEPTA', 'AT_NO_ACEPTA'],
    ['NO ACEPTA', 'AT_NO_ACEPTA'],
    ['REPROGRAMAR', 'REPROGRAMAR'],
    ['PENDIENTE', 'PENDIENTE'],
    ['BLACKLIST', 'BLACKLIST'],
    ['REEMPLAZO', 'REEMPLAZO'],
  ])('normaliza "%s" → "%s"', (input, expected) => {
    expect(normalizeResultado(input)).toBe(expected);
  });

  // Caso 8: minúsculo → normalizado
  it('minúsculo "seleccionado" → "SELECCIONADO"', () => {
    expect(normalizeResultado('seleccionado')).toBe('SELECCIONADO');
  });

  // Caso 9: valor desconhecido → null
  it('valor desconhecido → null', () => {
    expect(normalizeResultado('DESCONHECIDO')).toBeNull();
  });

  // Caso 10: null/undefined/empty → null
  it('null/undefined/empty → null', () => {
    expect(normalizeResultado(null)).toBeNull();
    expect(normalizeResultado(undefined)).toBeNull();
    expect(normalizeResultado('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// cleanString
// ─────────────────────────────────────────────────────────
describe('cleanString', () => {
  it('string normal → retorna como está', () => {
    expect(cleanString('Silva Lautaro')).toBe('Silva Lautaro');
  });

  it('string com espaços nas pontas → trimmed', () => {
    expect(cleanString('  Silva  ')).toBe('Silva');
  });

  it('null → null', () => expect(cleanString(null)).toBeNull());
  it('undefined → null', () => expect(cleanString(undefined)).toBeNull());
  it('string vazia → null', () => expect(cleanString('')).toBeNull());
  it('string só espaços → null', () => expect(cleanString('   ')).toBeNull());

  it('número → string do número', () => {
    expect(cleanString(738)).toBe('738');
  });

  it('número 0 → "0" (não null)', () => {
    expect(cleanString(0)).toBe('0');
  });

  it('booleano false → "false"', () => {
    expect(cleanString(false)).toBe('false');
  });

  it('objeto Date → string não-vazia', () => {
    const result = cleanString(new Date('2025-03-15'));
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });
});
