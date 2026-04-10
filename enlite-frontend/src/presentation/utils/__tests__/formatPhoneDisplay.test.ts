import { describe, it, expect } from 'vitest';
import { formatPhoneDisplay } from '../recruitmentHelpers';

describe('formatPhoneDisplay', () => {
  // ── null / empty ──────────────────────────────────────────────────────────
  it('returns null for null input', () => {
    expect(formatPhoneDisplay(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatPhoneDisplay('')).toBeNull();
  });

  // ── Argentina (54, 13 digits) ─────────────────────────────────────────────
  it('formats Argentine mobile number (13 digits starting with 54)', () => {
    expect(formatPhoneDisplay('5491155551234')).toBe('+54 9 11 5555-1234');
  });

  it('formats Argentine number with non-digit characters stripped', () => {
    expect(formatPhoneDisplay('+54 9 11 5555-1234')).toBe('+54 9 11 5555-1234');
  });

  it('formats Argentine number with different area code', () => {
    expect(formatPhoneDisplay('5493515551234')).toBe('+54 9 35 1555-1234');
  });

  // ── Brazil (55, 13 digits) ────────────────────────────────────────────────
  it('formats Brazilian mobile number (13 digits starting with 55)', () => {
    expect(formatPhoneDisplay('5511999991234')).toBe('+55 (11) 99999-1234');
  });

  it('formats Brazilian number with non-digit characters stripped', () => {
    expect(formatPhoneDisplay('+55 (21) 98888-5678')).toBe('+55 (21) 98888-5678');
  });

  // ── Generic (8+ digits, not matching AR/BR patterns) ──────────────────────
  it('formats generic international number with 8+ digits as +digits', () => {
    expect(formatPhoneDisplay('34612345678')).toBe('+34612345678');
  });

  it('formats 12-digit number starting with 54 as generic (not AR pattern)', () => {
    // 12 digits, not 13 → falls to generic
    expect(formatPhoneDisplay('541155551234')).toBe('+541155551234');
  });

  it('formats 14-digit number starting with 54 as generic (not AR pattern)', () => {
    expect(formatPhoneDisplay('54911555512345')).toBe('+54911555512345');
  });

  it('formats 8-digit number as generic', () => {
    expect(formatPhoneDisplay('12345678')).toBe('+12345678');
  });

  // ── Short numbers (< 8 digits) ───────────────────────────────────────────
  it('returns raw input for numbers shorter than 8 digits', () => {
    expect(formatPhoneDisplay('1234567')).toBe('1234567');
  });

  it('returns raw input for very short numbers', () => {
    expect(formatPhoneDisplay('123')).toBe('123');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('strips all non-digit chars before formatting', () => {
    expect(formatPhoneDisplay('+54-911-5555-1234')).toBe('+54 9 11 5555-1234');
  });

  it('handles number with spaces and dashes', () => {
    expect(formatPhoneDisplay('55 11 99999 1234')).toBe('+55 (11) 99999-1234');
  });
});
