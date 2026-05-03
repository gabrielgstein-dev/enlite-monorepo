import { describe, it, expect } from 'vitest';
import { computeWeeklyHours } from '../vacancyScheduleUtils';

describe('computeWeeklyHours', () => {
  it('returns 0 for empty schedule', () => {
    expect(computeWeeklyHours([])).toBe(0);
  });

  it('returns 0 when entries are incomplete', () => {
    expect(
      computeWeeklyHours([
        { days: [], timeFrom: '09:00', timeTo: '17:00' },
        { days: ['lun'], timeFrom: '', timeTo: '' },
      ]),
    ).toBe(0);
  });

  it('multiplies hours per slot by number of days', () => {
    // 5 days × 8h = 40h
    expect(
      computeWeeklyHours([
        { days: ['lun', 'mar', 'mie', 'jue', 'vie'], timeFrom: '09:00', timeTo: '17:00' },
      ]),
    ).toBe(40);
  });

  it('sums multiple entries', () => {
    expect(
      computeWeeklyHours([
        { days: ['lun', 'mar'], timeFrom: '09:00', timeTo: '12:00' }, // 2 × 3 = 6
        { days: ['jue'], timeFrom: '14:00', timeTo: '18:00' }, //          1 × 4 = 4
      ]),
    ).toBe(10);
  });

  it('handles midnight-crossing slot (20:00 → 08:00 = 12h)', () => {
    expect(
      computeWeeklyHours([
        { days: ['vie', 'sab'], timeFrom: '20:00', timeTo: '08:00' },
      ]),
    ).toBe(24);
  });

  it('handles half-hour granularity', () => {
    expect(
      computeWeeklyHours([
        { days: ['lun'], timeFrom: '09:00', timeTo: '12:30' }, // 3.5h
      ]),
    ).toBe(3.5);
  });

  it('skips entries with malformed time', () => {
    expect(
      computeWeeklyHours([
        { days: ['lun'], timeFrom: '9am', timeTo: '17:00' },
        { days: ['mar'], timeFrom: '09:00', timeTo: '17:00' }, // 8h
      ]),
    ).toBe(8);
  });

  it('does not collapse to integer when total is fractional', () => {
    expect(
      computeWeeklyHours([
        { days: ['lun', 'mar', 'mie'], timeFrom: '09:00', timeTo: '11:30' }, // 3 × 2.5 = 7.5
      ]),
    ).toBe(7.5);
  });
});
