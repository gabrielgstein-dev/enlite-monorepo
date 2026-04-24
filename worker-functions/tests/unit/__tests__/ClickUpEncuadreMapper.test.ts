/**
 * ClickUpEncuadreMapper — Unit Tests
 *
 * Coverage:
 *   (a) task with all fields → complete payload (gender, not sex)
 *   (b) task with no email and no whatsapp → returns null
 *   (c) status "admitido" → resultado SELECCIONADO
 *   (d) status "no admitido" → resultado RECHAZADO
 *   (e) status "en progreso" → resultado PENDIENTE
 *   (f) Tipo de Profesional "Otra" → profession null
 *   (g) dedupHash is MD5('clickup|{taskId}')
 *   (h) Sexo Prestador "Trans" → gender TRANS (not UNDISCLOSED)
 *   (i) worker output has no "sex" property
 */

import * as crypto from 'crypto';
import { ClickUpEncuadreMapper } from '../../../src/modules/integration/infrastructure/clickup/ClickUpEncuadreMapper';
import type { ClickUpFieldResolverOptions } from '../../../src/modules/integration/infrastructure/clickup/ClickUpFieldResolver';

// ── Mock ClickUpFieldResolver ─────────────────────────────────────────────────

// We build a minimal resolver stub that maps field-name+orderindex to label strings
// without hitting the ClickUp API.

type DropdownStub = Record<string, Record<number, string>>;

function makeResolver(dropdowns: DropdownStub) {
  return {
    resolveDropdown(fieldName: string, value: number | string | null | undefined): string | null {
      if (value === null || value === undefined || value === '') return null;
      const map = dropdowns[fieldName];
      if (!map) return null;
      const key = typeof value === 'number' ? value : Number(value);
      return Number.isNaN(key) ? null : (map[key] ?? null);
    },
    resolveLabel: () => null,
    resolveLabels: () => [],
    getFieldType: () => null,
  };
}

// ── Task builder ──────────────────────────────────────────────────────────────

interface CfEntry { name: string; value: unknown; }

function makeTask(id: string, status: string, fields: CfEntry[]) {
  return {
    id,
    name: `Task ${id}`,
    status: { status, color: '#000', type: 'custom' },
    parent: null,
    custom_fields: fields.map(f => ({ id: `cf-${f.name}`, name: f.name, type: 'text', value: f.value })),
    url: `https://app.clickup.com/t/${id}`,
    date_created: '1700000000000',
    date_updated: '1700000000000',
  };
}

// ── Shared resolver with known dropdowns ──────────────────────────────────────

const resolver = makeResolver({
  'Sexo Prestador': {
    0: 'Hombre',
    1: 'Mujer',
    2: 'Trans',
    3: 'Prefiero no decir',
  },
  'Tipo de Profesional': {
    0: 'Acompañante Terapéutico',
    1: 'Cuidado Humano',
    2: 'Enfermería',
    3: 'Estudiante de Psicología',
    4: 'Otra',
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClickUpEncuadreMapper', () => {
  let mapper: ClickUpEncuadreMapper;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapper = new ClickUpEncuadreMapper(resolver as any);
  });

  // (a) Task with all fields → complete payload (gender field, not sex)
  it('maps a fully populated task to a complete payload with gender', () => {
    const task = makeTask('task001', 'en progreso', [
      { name: 'Email Prestador',             value: 'juan@example.com' },
      { name: 'Whatsapp Prestador',           value: '1151234567' },
      { name: 'Apellido y Nombre Prestador',  value: 'García, Juan' },
      { name: 'Fecha Nacimiento Prestador',   value: '1990-05-15T00:00:00.000Z' },
      { name: 'Sexo Prestador',               value: 1 },        // → 'Mujer' → FEMALE
      { name: 'Tipo de Profesional',          value: 0 },        // → 'AT'
      { name: 'Caso Número',                  value: 42 },
    ]);

    const result = mapper.map(task as any);

    expect(result).not.toBeNull();
    expect(result!.worker.email).toBe('juan@example.com');
    expect(result!.worker.rawWhatsapp).toBe('1151234567');
    expect(result!.worker.firstName).toBe('Juan');
    expect(result!.worker.lastName).toBe('García');
    expect(result!.worker.gender).toBe('FEMALE');
    expect(result!.worker.profession).toBe('AT');
    expect(result!.worker.birthDate).toBeInstanceOf(Date);

    expect(result!.encuadre.clickupTaskId).toBe('task001');
    expect(result!.encuadre.caseNumber).toBe(42);
    expect(result!.encuadre.rawName).toBe('García, Juan');
    expect(result!.encuadre.origen).toBe('ClickUp');
  });

  // (i) worker output has no "sex" property
  it('does not expose a "sex" property on the worker output', () => {
    const task = makeTask('task001b', 'en progreso', [
      { name: 'Email Prestador', value: 'a@b.com' },
      { name: 'Sexo Prestador',  value: 0 }, // Hombre → MALE
    ]);
    const result = mapper.map(task as any);
    expect(result).not.toBeNull();
    expect('sex' in result!.worker).toBe(false);
  });

  // (h) Sexo Prestador "Trans" → gender TRANS (not UNDISCLOSED)
  it('maps "Trans" to gender TRANS', () => {
    const task = makeTask('task001c', 'solicitudes', [
      { name: 'Email Prestador', value: 'trans@example.com' },
      { name: 'Sexo Prestador',  value: 2 }, // → 'Trans' → TRANS
    ]);
    const result = mapper.map(task as any);
    expect(result).not.toBeNull();
    expect(result!.worker.gender).toBe('TRANS');
  });

  // gender "Hombre" → MALE
  it('maps "Hombre" to gender MALE', () => {
    const task = makeTask('task001d', 'solicitudes', [
      { name: 'Email Prestador', value: 'hombre@example.com' },
      { name: 'Sexo Prestador',  value: 0 }, // → 'Hombre' → MALE
    ]);
    const result = mapper.map(task as any);
    expect(result!.worker.gender).toBe('MALE');
  });

  // gender "Prefiero no decir" → UNDISCLOSED
  it('maps "Prefiero no decir" to gender UNDISCLOSED', () => {
    const task = makeTask('task001e', 'solicitudes', [
      { name: 'Email Prestador', value: 'nd@example.com' },
      { name: 'Sexo Prestador',  value: 3 }, // → 'Prefiero no decir' → UNDISCLOSED
    ]);
    const result = mapper.map(task as any);
    expect(result!.worker.gender).toBe('UNDISCLOSED');
  });

  // (b) No email and no whatsapp → null
  it('returns null when task has neither email nor whatsapp', () => {
    const task = makeTask('task002', 'solicitudes', [
      { name: 'Apellido y Nombre Prestador', value: 'Anónimo' },
      { name: 'Caso Número',                 value: 10 },
    ]);

    expect(mapper.map(task as any)).toBeNull();
  });

  // (c) status "admitido" → SELECCIONADO
  it('maps status "admitido" to resultado SELECCIONADO', () => {
    const task = makeTask('task003', 'admitido', [
      { name: 'Email Prestador', value: 'a@b.com' },
    ]);
    const result = mapper.map(task as any);
    expect(result!.encuadre.resultado).toBe('SELECCIONADO');
  });

  // (d) status "no admitido" → RECHAZADO
  it('maps status "no admitido" to resultado RECHAZADO', () => {
    const task = makeTask('task004', 'no admitido', [
      { name: 'Email Prestador', value: 'a@b.com' },
    ]);
    const result = mapper.map(task as any);
    expect(result!.encuadre.resultado).toBe('RECHAZADO');
  });

  // (e) status "en progreso" → PENDIENTE
  it('maps status "en progreso" to resultado PENDIENTE', () => {
    const task = makeTask('task005', 'en progreso', [
      { name: 'Whatsapp Prestador', value: '1151234567' },
    ]);
    const result = mapper.map(task as any);
    expect(result!.encuadre.resultado).toBe('PENDIENTE');
  });

  // also covers solicitudes, entrevistas, en espera → PENDIENTE
  it.each(['solicitudes', 'entrevistas', 'en espera'])(
    'maps status "%s" to resultado PENDIENTE',
    (status) => {
      const task = makeTask(`task-${status}`, status, [
        { name: 'Email Prestador', value: 'a@b.com' },
      ]);
      expect(mapper.map(task as any)!.encuadre.resultado).toBe('PENDIENTE');
    },
  );

  // (f) Tipo de Profesional "Otra" → profession null
  it('maps "Otra" profession to null', () => {
    const task = makeTask('task006', 'solicitudes', [
      { name: 'Email Prestador',    value: 'a@b.com' },
      { name: 'Tipo de Profesional', value: 4 },  // → 'Otra'
    ]);
    const result = mapper.map(task as any);
    expect(result!.worker.profession).toBeNull();
  });

  // (f2) Tipo de Profesional "Estudiante de Psicología" → profession null
  it('maps "Estudiante de Psicología" profession to null', () => {
    const task = makeTask('task007', 'solicitudes', [
      { name: 'Email Prestador',    value: 'a@b.com' },
      { name: 'Tipo de Profesional', value: 3 },  // → 'Estudiante de Psicología'
    ]);
    expect(mapper.map(task as any)!.worker.profession).toBeNull();
  });

  // (g) dedupHash is MD5('clickup|{taskId}')
  it('produces dedupHash = MD5("clickup|{taskId}")', () => {
    const taskId = 'task999';
    const expected = crypto.createHash('md5').update(`clickup|${taskId}`).digest('hex');

    const task = makeTask(taskId, 'admitido', [
      { name: 'Email Prestador', value: 'x@y.com' },
    ]);
    const result = mapper.map(task as any);
    expect(result!.encuadre.dedupHash).toBe(expected);
  });

  // Edge: task with only whatsapp (no email) → still valid
  it('returns a result when whatsapp is set but email is missing', () => {
    const task = makeTask('task010', 'solicitudes', [
      { name: 'Whatsapp Prestador', value: '5491151234567' },
    ]);
    const result = mapper.map(task as any);
    expect(result).not.toBeNull();
    expect(result!.worker.email).toBeNull();
    expect(result!.worker.rawWhatsapp).toBe('5491151234567');
  });

  // Edge: caseNumber null when field absent
  it('sets caseNumber to null when Caso Número field is absent', () => {
    const task = makeTask('task011', 'solicitudes', [
      { name: 'Email Prestador', value: 'a@b.com' },
    ]);
    expect(mapper.map(task as any)!.encuadre.caseNumber).toBeNull();
  });
});
