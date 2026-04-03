/**
 * vacanciesData.test.ts
 *
 * GARANTIA: As opções dos selects de vacantes NÃO contêm
 * opção duplicada com value="". O SelectField já adiciona
 * o placeholder automaticamente.
 */

import { describe, it, expect } from 'vitest';
import { getClientOptions, getStatusOptions, getPriorityOptions } from '../vacanciesData';

// Mock i18n t function — retorna a chave como string
const t = ((key: string) => key) as any;

describe('vacanciesData — no duplicate empty-value options', () => {
  it('CRITICAL: getClientOptions does NOT include value="" option', () => {
    const options = getClientOptions(t);
    const emptyOptions = options.filter((o) => o.value === '');
    expect(emptyOptions).toHaveLength(0);
  });

  it('CRITICAL: getStatusOptions does NOT include value="" option', () => {
    const options = getStatusOptions(t);
    const emptyOptions = options.filter((o) => o.value === '');
    expect(emptyOptions).toHaveLength(0);
  });

  it('CRITICAL: getPriorityOptions does NOT include value="" option', () => {
    const options = getPriorityOptions(t);
    const emptyOptions = options.filter((o) => o.value === '');
    expect(emptyOptions).toHaveLength(0);
  });
});

describe('vacanciesData — options have correct values', () => {
  it('client options contain osde and swiss', () => {
    const options = getClientOptions(t);
    const values = options.map((o) => o.value);
    expect(values).toContain('osde');
    expect(values).toContain('swiss');
  });

  it('status options contain ativo, processo, pausado', () => {
    const options = getStatusOptions(t);
    const values = options.map((o) => o.value);
    expect(values).toContain('ativo');
    expect(values).toContain('processo');
    expect(values).toContain('pausado');
  });

  it('priority options contain URGENT, HIGH, NORMAL, LOW', () => {
    const options = getPriorityOptions(t);
    const values = options.map((o) => o.value);
    expect(values).toContain('URGENT');
    expect(values).toContain('HIGH');
    expect(values).toContain('NORMAL');
    expect(values).toContain('LOW');
  });
});

describe('vacanciesData — all options use i18n keys', () => {
  it('client option labels are i18n keys (not hardcoded strings)', () => {
    const options = getClientOptions(t);
    options.forEach((o) => {
      expect(o.label).toMatch(/^admin\.vacancies\./);
    });
  });

  it('status option labels are i18n keys', () => {
    const options = getStatusOptions(t);
    options.forEach((o) => {
      expect(o.label).toMatch(/^admin\.vacancies\./);
    });
  });

  it('priority option labels are i18n keys', () => {
    const options = getPriorityOptions(t);
    options.forEach((o) => {
      expect(o.label).toMatch(/^admin\.vacancies\./);
    });
  });
});
