import { describe, it, expect } from 'vitest';
import { maskDate, unmask, parseDateToISO, formatDateFromISO } from '../useMask';

describe('useMask utilities', () => {
  describe('maskDate', () => {
    it('should format partial date input', () => {
      expect(maskDate('18')).toBe('18');
      expect(maskDate('1803')).toBe('18/03');
      expect(maskDate('18031990')).toBe('18/03/1990');
    });

    it('should handle input with slashes', () => {
      expect(maskDate('18/03/1990')).toBe('18/03/1990');
    });

    it('should limit to 8 digits', () => {
      expect(maskDate('18031990123')).toBe('18/03/1990');
    });

    it('should handle empty string', () => {
      expect(maskDate('')).toBe('');
    });

    it('should handle input with non-numeric characters', () => {
      expect(maskDate('18a03b1990')).toBe('18/03/1990');
    });
  });

  describe('unmask', () => {
    it('should remove all non-numeric characters', () => {
      expect(unmask('18/03/1990')).toBe('18031990');
      expect(unmask('123-456-789')).toBe('123456789');
      expect(unmask('abc123')).toBe('123');
    });

    it('should handle empty string', () => {
      expect(unmask('')).toBe('');
    });
  });

  describe('parseDateToISO', () => {
    it('should convert DD/MM/AAAA to AAAA-MM-DD', () => {
      expect(parseDateToISO('18/03/1990')).toBe('1990-03-18');
      expect(parseDateToISO('01/01/2000')).toBe('2000-01-01');
    });

    it('should return original value if not 8 digits', () => {
      expect(parseDateToISO('18/03/90')).toBe('18/03/90');
      expect(parseDateToISO('')).toBe('');
    });
  });

  describe('formatDateFromISO', () => {
    it('should convert AAAA-MM-DD to DD/MM/AAAA', () => {
      expect(formatDateFromISO('1990-03-18')).toBe('18/03/1990');
      expect(formatDateFromISO('2000-01-01')).toBe('01/01/2000');
    });

    it('should return original value if invalid format', () => {
      expect(formatDateFromISO('18/03/1990')).toBe('18/03/1990');
      expect(formatDateFromISO('')).toBe('');
      expect(formatDateFromISO('invalid')).toBe('invalid');
    });

    it('should handle short strings', () => {
      expect(formatDateFromISO('1990')).toBe('1990');
    });
  });
});
