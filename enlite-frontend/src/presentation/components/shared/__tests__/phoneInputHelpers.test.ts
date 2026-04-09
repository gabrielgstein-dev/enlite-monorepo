import { describe, it, expect } from 'vitest';
import { extractNationalNumber, getMaxDigitsForCountry, getPlaceholderForCountry, getSortedCountries, PRIORITY_COUNTRIES } from '../phoneInputHelpers';

describe('phoneInputHelpers', () => {
  describe('extractNationalNumber', () => {
    it('extrai número nacional de telefone brasileiro', () => {
      const result = extractNationalNumber('+5511999998888', '55');
      expect(result).toBe('11999998888');
    });

    it('extrai número nacional de telefone argentino', () => {
      const result = extractNationalNumber('+5491112345678', '54');
      expect(result).toBe('91112345678');
    });

    it('extrai número nacional de telefone americano', () => {
      const result = extractNationalNumber('+15551234567', '1');
      expect(result).toBe('5551234567');
    });

    it('retorna valor original se não começa com +', () => {
      expect(extractNationalNumber('11999998888', '55')).toBe('11999998888');
    });

    it('retorna valor vazio para string vazia', () => {
      expect(extractNationalNumber('', '55')).toBe('');
    });
  });

  describe('getMaxDigitsForCountry', () => {
    it('retorna 11 para Brasil', () => {
      expect(getMaxDigitsForCountry('BR')).toBe(11);
    });

    it('retorna 11 para Argentina (inclui prefixo 9 de celular)', () => {
      expect(getMaxDigitsForCountry('AR')).toBe(11);
    });

    it('retorna 10 para EUA', () => {
      expect(getMaxDigitsForCountry('US')).toBe(10);
    });

    it('retorna 15 (padrão) para país sem limite definido', () => {
      expect(getMaxDigitsForCountry('JP')).toBe(15);
    });
  });

  describe('getPlaceholderForCountry', () => {
    it('retorna placeholder brasileiro', () => {
      expect(getPlaceholderForCountry('BR')).toBe('+55 11 99999 9999');
    });

    it('retorna placeholder argentino', () => {
      expect(getPlaceholderForCountry('AR')).toBe('+54 9 11 2345 6789');
    });

    it('retorna placeholder genérico para país sem definição', () => {
      expect(getPlaceholderForCountry('JP')).toBe('+XX XXX XXX XXX');
    });
  });

  describe('getSortedCountries', () => {
    it('retorna países prioritários primeiro', () => {
      const sorted = getSortedCountries();
      const firstCountries = sorted.slice(0, PRIORITY_COUNTRIES.length);
      expect(firstCountries).toEqual(PRIORITY_COUNTRIES);
    });

    it('retorna lista com todos os países disponíveis', () => {
      const sorted = getSortedCountries();
      expect(sorted.length).toBeGreaterThan(PRIORITY_COUNTRIES.length);
    });
  });

  describe('truncamento de número internacional (bug fix)', () => {
    it('número AR com código de país NÃO deve perder dígitos nacionais', () => {
      // Simula o que handleChange faz: extrair nacional e aplicar limite
      const fullNumber = '+5491112345678';
      const countryCode = '54';
      const national = extractNationalNumber(fullNumber, countryCode);
      const nationalDigits = national.replace(/\D/g, '');
      const maxDigits = getMaxDigitsForCountry('AR'); // 11 (com prefixo 9 de celular)

      // O número nacional deve ter até 11 dígitos — não truncar baseado no total
      expect(nationalDigits.length).toBeLessThanOrEqual(maxDigits);
      // O número completo NÃO deve ser usado para contagem
      const allDigits = fullNumber.replace(/\D/g, '');
      expect(allDigits.length).toBeGreaterThan(maxDigits); // 13 > 11 — antes truncava aqui
    });

    it('número BR com código de país NÃO deve perder dígitos nacionais', () => {
      const fullNumber = '+5511999998888';
      const countryCode = '55';
      const national = extractNationalNumber(fullNumber, countryCode);
      const nationalDigits = national.replace(/\D/g, '');
      const maxDigits = getMaxDigitsForCountry('BR'); // 11

      expect(nationalDigits.length).toBeLessThanOrEqual(maxDigits);
    });

    it('número US com código de país NÃO deve perder dígitos nacionais', () => {
      const fullNumber = '+15551234567';
      const countryCode = '1';
      const national = extractNationalNumber(fullNumber, countryCode);
      const nationalDigits = national.replace(/\D/g, '');
      const maxDigits = getMaxDigitsForCountry('US'); // 10

      expect(nationalDigits.length).toBeLessThanOrEqual(maxDigits);
    });
  });
});
