/**
 * PublicJobMapper.test.ts
 *
 * Scenarios:
 *   1. sanitizeDescription — returns empty string for generic "Caso operacional importado" prefix
 *   2. sanitizeDescription — returns empty string for "Caso operacional" prefix
 *   3. sanitizeDescription — returns sanitized string for real description
 *   4. sanitizeDescription — returns empty string for null
 *   5. sanitizeDescription — trims whitespace
 *   6. mapPublicJobRow — maps all fields correctly
 *   7. mapPublicJobRow — description is sanitized in the output
 */

import { sanitizeDescription, mapPublicJobRow } from '../PublicJobMapper';
import type { PublicJobRow } from '../../domain/PublicJobDto';

describe('sanitizeDescription', () => {
  it('returns empty string for generic "Caso operacional importado" prefix', () => {
    expect(sanitizeDescription('Caso operacional importado. Case #42')).toBe('');
  });

  it('returns empty string for "caso operacional" prefix (case-insensitive)', () => {
    expect(sanitizeDescription('CASO OPERACIONAL importado do ClickUp. Nº 100')).toBe('');
  });

  it('returns empty string for exact "Caso operacional" prefix', () => {
    expect(sanitizeDescription('Caso operacional')).toBe('');
  });

  it('returns description unchanged for real content', () => {
    const real = 'Buscamos AT con experiencia en TEA para trabajo en CABA.';
    expect(sanitizeDescription(real)).toBe(real);
  });

  it('returns empty string for null input', () => {
    expect(sanitizeDescription(null)).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeDescription('  Descripción real con contenido  ')).toBe(
      'Descripción real con contenido',
    );
  });

  it('returns empty string for empty string input', () => {
    expect(sanitizeDescription('')).toBe('');
  });
});

describe('mapPublicJobRow', () => {
  function makeRow(overrides: Partial<PublicJobRow> = {}): PublicJobRow {
    return {
      id: 'uuid-1',
      case_number: 42,
      vacancy_number: 7,
      title: 'CASO 42-7',
      status: 'SEARCHING',
      description: 'Buscamos AT con experiencia.',
      schedule_days_hours: 'Lunes a Viernes 9-17',
      worker_profile_sought: 'Con experiencia en TEA',
      service: 'DOMICILIO',
      pathologies: 'TEA',
      provincia: 'Buenos Aires',
      localidad: 'Palermo',
      detail_link: 'https://srt.io/abc',
      ...overrides,
    };
  }

  it('maps all fields from row to DTO', () => {
    const row = makeRow();
    const dto = mapPublicJobRow(row);

    expect(dto.id).toBe('uuid-1');
    expect(dto.case_number).toBe(42);
    expect(dto.vacancy_number).toBe(7);
    expect(dto.title).toBe('CASO 42-7');
    expect(dto.status).toBe('SEARCHING');
    expect(dto.description).toBe('Buscamos AT con experiencia.');
    expect(dto.schedule_days_hours).toBe('Lunes a Viernes 9-17');
    expect(dto.worker_profile_sought).toBe('Con experiencia en TEA');
    expect(dto.service).toBe('DOMICILIO');
    expect(dto.pathologies).toBe('TEA');
    expect(dto.provincia).toBe('Buenos Aires');
    expect(dto.localidad).toBe('Palermo');
    expect(dto.detail_link).toBe('https://srt.io/abc');
  });

  it('sanitizes generic description to empty string in DTO', () => {
    const row = makeRow({ description: 'Caso operacional importado. Case #42' });
    const dto = mapPublicJobRow(row);
    expect(dto.description).toBe('');
  });

  it('returns null fields as null', () => {
    const row = makeRow({
      schedule_days_hours: null,
      worker_profile_sought: null,
      service: null,
      pathologies: null,
      provincia: null,
      localidad: null,
    });
    const dto = mapPublicJobRow(row);

    expect(dto.schedule_days_hours).toBeNull();
    expect(dto.worker_profile_sought).toBeNull();
    expect(dto.service).toBeNull();
    expect(dto.pathologies).toBeNull();
    expect(dto.provincia).toBeNull();
    expect(dto.localidad).toBeNull();
  });
});
