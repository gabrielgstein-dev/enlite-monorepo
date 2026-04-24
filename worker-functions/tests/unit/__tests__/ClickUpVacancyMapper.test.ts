/**
 * ClickUpVacancyMapper — Unit Tests
 *
 * Coverage:
 *   (a) Task com 1 endereço → 1 vaga gerada com patientClickupTaskId = task.id
 *   (b) Task com 2 endereços (Dom1+Dom2) → 2 vagas com endereços distintos, mesmo case_number
 *   (c) Task com Dom2="null" literal → ignora, gera só 1 vaga
 *   (d) Task sem Caso Número → []
 *   (e) Task com parent → []
 *   (f) Status "Baja" → patientStatus=DISCONTINUED, jobPostingStatus=CLOSED
 *   (g) Status "Activación pendiente" → patientStatus=ACTIVE, jobPostingStatus=PENDING_ACTIVATION
 *   (h) Status "Activo" → patientStatus=ACTIVE, jobPostingStatus=ACTIVE
 *   (i) Task sem endereço algum → 1 vaga com addresses null (vaga sem endereço é válida)
 *   (j) ScheduleDaysHours copiado do campo de texto livre
 *   (k) Status desconhecido → patientStatus=null, jobPostingStatus=null
 *   (l) schedule é sempre null (v1)
 *   (m) Status "Alta" → patientStatus=DISCHARGED, jobPostingStatus=CLOSED
 *   (n) Status "Suspendido Temporariamente" → patientStatus=SUSPENDED, jobPostingStatus=SUSPENDED
 */

import { ClickUpVacancyMapper } from '../../../src/modules/integration/infrastructure/clickup/ClickUpVacancyMapper';
import type { ClickUpTask } from '../../../src/modules/integration/infrastructure/clickup/ClickUpTask';

// ── Fixture helpers ────────────────────────────────────────────────────────────

interface CfEntry { name: string; value: unknown; type?: string; }

function makeTask(
  id: string,
  status: string,
  fields: CfEntry[],
  parent: string | null = null,
): ClickUpTask {
  return {
    id,
    name: `Task ${id}`,
    status: { status, color: '#000', type: 'custom' },
    parent,
    custom_fields: fields.map(f => ({
      id: `cf-${f.name}`,
      name: f.name,
      type: f.type ?? 'text',
      value: f.value,
    })),
    url: `https://app.clickup.com/t/${id}`,
    date_created: '1700000000000',
    date_updated: '1700100000000',
  };
}

function locationField(formatted: string | null) {
  if (!formatted) return null;
  return { formatted_address: formatted, lat: -34.6, lng: -58.4 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClickUpVacancyMapper', () => {
  const mapper = new ClickUpVacancyMapper();

  // (a) Task com 1 endereço → 1 vaga
  it('(a) task com 1 endereço gera 1 vaga com patientClickupTaskId = task.id', () => {
    const task = makeTask('task-a', 'Activo', [
      { name: 'Caso Número', value: 101 },
      { name: 'Domicilio 1 Principal Paciente', value: locationField('Av. Corrientes 1234, CABA') },
      { name: 'Domicilio Informado Paciente 1', value: 'Corrientes 1234' },
      { name: 'Domicilio 2 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 2', value: null },
      { name: 'Domicilio 3 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 3', value: null },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(1);
    expect(result[0].caseNumber).toBe(101);
    expect(result[0].clickupTaskId).toBe('task-a');
    expect(result[0].patientClickupTaskId).toBe('task-a');
    expect(result[0].serviceAddressFormatted).toBe('Av. Corrientes 1234, CABA');
    expect(result[0].serviceAddressRaw).toBe('Corrientes 1234');
    // Status cascade: Activo → ACTIVE / ACTIVE
    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('ACTIVE');
  });

  // (b) Task com 2 endereços → 2 vagas
  it('(b) task com 2 endereços gera 2 vagas com endereços distintos e mesmo case_number', () => {
    const task = makeTask('task-b', 'Busqueda', [
      { name: 'Caso Número', value: 202 },
      { name: 'Domicilio 1 Principal Paciente', value: locationField('Belgrano 456, Córdoba') },
      { name: 'Domicilio Informado Paciente 1', value: 'Belgrano 456' },
      { name: 'Domicilio 2 Principal Paciente', value: locationField('Rivadavia 789, Córdoba') },
      { name: 'Domicilio Informado Paciente 2', value: 'Rivadavia 789' },
      { name: 'Domicilio 3 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 3', value: null },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(2);
    expect(result[0].caseNumber).toBe(202);
    expect(result[1].caseNumber).toBe(202);
    expect(result[0].serviceAddressFormatted).toBe('Belgrano 456, Córdoba');
    expect(result[1].serviceAddressFormatted).toBe('Rivadavia 789, Córdoba');
    expect(result[0].serviceAddressFormatted).not.toBe(result[1].serviceAddressFormatted);
    // Both slots share same patientStatus (same task)
    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[1].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('SEARCHING');
    expect(result[1].jobPostingStatus).toBe('SEARCHING');
  });

  // (c) Dom2="null" literal → ignora, gera só 1 vaga
  it('(c) Dom2="null" literal é ignorado — gera só 1 vaga', () => {
    const task = makeTask('task-c', 'Activo', [
      { name: 'Caso Número', value: 303 },
      { name: 'Domicilio 1 Principal Paciente', value: locationField('San Martín 100, Rosario') },
      { name: 'Domicilio Informado Paciente 1', value: 'San Martín 100' },
      { name: 'Domicilio 2 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 2', value: 'null' }, // literal "null"
      { name: 'Domicilio 3 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 3', value: null },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(1);
    expect(result[0].serviceAddressFormatted).toBe('San Martín 100, Rosario');
  });

  // (d) Task sem Caso Número → []
  it('(d) task sem Caso Número retorna []', () => {
    const task = makeTask('task-d', 'Activo', [
      { name: 'Caso Número', value: null },
      { name: 'Domicilio 1 Principal Paciente', value: locationField('Rivadavia 1, CABA') },
    ]);

    expect(mapper.map(task)).toEqual([]);
  });

  // (d2) Task sem custom field Caso Número → []
  it('(d2) task sem custom field Caso Número retorna []', () => {
    const task = makeTask('task-d2', 'Activo', [
      { name: 'Domicilio 1 Principal Paciente', value: locationField('Rivadavia 1, CABA') },
    ]);

    expect(mapper.map(task)).toEqual([]);
  });

  // (e) Task com parent → []
  it('(e) subtask (parent != null) retorna []', () => {
    const task = makeTask('task-e', 'Vacante Abierta', [
      { name: 'Caso Número', value: 500 },
    ], 'task-parent-123');

    expect(mapper.map(task)).toEqual([]);
  });

  // (f) Status "Baja" → DISCONTINUED / CLOSED
  it('(f) status "Baja" → patientStatus=DISCONTINUED, jobPostingStatus=CLOSED', () => {
    const task = makeTask('task-f', 'Baja', [
      { name: 'Caso Número', value: 600 },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(1);
    expect(result[0].patientStatus).toBe('DISCONTINUED');
    expect(result[0].jobPostingStatus).toBe('CLOSED');
  });

  // (g) Status "Activación pendiente"
  it('(g) status "Activación pendiente" → patientStatus=ACTIVE, jobPostingStatus=PENDING_ACTIVATION', () => {
    const task = makeTask('task-g', 'Activación pendiente', [
      { name: 'Caso Número', value: 700 },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(1);
    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('PENDING_ACTIVATION');
  });

  // (h) Status "Activo"
  it('(h) status "Activo" → patientStatus=ACTIVE, jobPostingStatus=ACTIVE', () => {
    const task = makeTask('task-h', 'Activo', [
      { name: 'Caso Número', value: 800 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('ACTIVE');
  });

  // (i) Task sem endereço → 1 vaga com addresses null
  it('(i) task sem endereço algum gera 1 vaga com addresses null', () => {
    const task = makeTask('task-i', 'Busqueda', [
      { name: 'Caso Número', value: 900 },
      { name: 'Domicilio 1 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 1', value: null },
      { name: 'Domicilio 2 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 2', value: null },
      { name: 'Domicilio 3 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 3', value: null },
    ]);

    const result = mapper.map(task);

    expect(result).toHaveLength(1);
    expect(result[0].serviceAddressFormatted).toBeNull();
    expect(result[0].serviceAddressRaw).toBeNull();
    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('SEARCHING');
  });

  // (j) scheduleDaysHours copiado do campo de texto
  it('(j) scheduleDaysHours é copiado do campo de texto livre', () => {
    const task = makeTask('task-j', 'Activo', [
      { name: 'Caso Número', value: 901 },
      { name: 'Días y Horarios de Acompañamiento', value: 'Lunes a viernes 08:00-16:00' },
    ]);

    const result = mapper.map(task);

    expect(result[0].scheduleDaysHours).toBe('Lunes a viernes 08:00-16:00');
  });

  // (k) Status desconhecido → null / null
  it('(k) status desconhecido → patientStatus=null, jobPostingStatus=null', () => {
    const task = makeTask('task-k', 'Algum status inexistente', [
      { name: 'Caso Número', value: 902 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBeNull();
    expect(result[0].jobPostingStatus).toBeNull();
  });

  // (l) schedule é sempre null em v1
  it('(l) schedule é sempre null na v1 (LLM enrichment futuro)', () => {
    const task = makeTask('task-l', 'Activo', [
      { name: 'Caso Número', value: 903 },
      { name: 'Días y Horarios de Acompañamiento', value: 'Todos los días 09:00-17:00' },
    ]);

    const result = mapper.map(task);

    expect(result[0].schedule).toBeNull();
    expect(result[0].scheduleDaysHours).toBe('Todos los días 09:00-17:00');
  });

  // (m) Alta → DISCHARGED / CLOSED
  it('(m) status "Alta" → patientStatus=DISCHARGED, jobPostingStatus=CLOSED', () => {
    const task = makeTask('task-alta', 'Alta', [
      { name: 'Caso Número', value: 999 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('DISCHARGED');
    expect(result[0].jobPostingStatus).toBe('CLOSED');
  });

  // (n) Suspendido → SUSPENDED / SUSPENDED
  it('(n) status "Suspendido Temporariamente" → patientStatus=SUSPENDED, jobPostingStatus=SUSPENDED', () => {
    const task = makeTask('task-susp', 'Suspendido Temporariamente', [
      { name: 'Caso Número', value: 1000 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('SUSPENDED');
    expect(result[0].jobPostingStatus).toBe('SUSPENDED');
  });

  // Edge: formatted address "null" literal in location object
  it('formatted_address="null" literal no location object é ignorado', () => {
    const task = makeTask('task-nulladdr', 'Activo', [
      { name: 'Caso Número', value: 1001 },
      { name: 'Domicilio 1 Principal Paciente', value: { formatted_address: 'null', lat: 0, lng: 0 } },
      { name: 'Domicilio Informado Paciente 1', value: 'Dirección real' },
      { name: 'Domicilio 2 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 2', value: null },
      { name: 'Domicilio 3 Principal Paciente', value: null },
      { name: 'Domicilio Informado Paciente 3', value: null },
    ]);

    const result = mapper.map(task);
    // Formatted null, raw = "Dirección real" → still 1 slot filled
    expect(result).toHaveLength(1);
    expect(result[0].serviceAddressFormatted).toBeNull();
    expect(result[0].serviceAddressRaw).toBe('Dirección real');
  });

  // Edge: "Vacante Abierta" → ACTIVE / SEARCHING
  it('status "Vacante Abierta" → patientStatus=ACTIVE, jobPostingStatus=SEARCHING', () => {
    const task = makeTask('task-va', 'Vacante Abierta', [
      { name: 'Caso Número', value: 1002 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('SEARCHING');
  });

  // Edge: "Equipe de resposta rápida" → ACTIVE / FULLY_STAFFED
  it('status "Equipe de resposta rápida" → patientStatus=ACTIVE, jobPostingStatus=FULLY_STAFFED', () => {
    const task = makeTask('task-err', 'Equipe de resposta rápida', [
      { name: 'Caso Número', value: 1003 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('FULLY_STAFFED');
  });

  // Edge: "Reemplazo" → ACTIVE / SEARCHING_REPLACEMENT
  it('status "Reemplazo" → patientStatus=ACTIVE, jobPostingStatus=SEARCHING_REPLACEMENT', () => {
    const task = makeTask('task-remp', 'Reemplazo', [
      { name: 'Caso Número', value: 1004 },
    ]);

    const result = mapper.map(task);

    expect(result[0].patientStatus).toBe('ACTIVE');
    expect(result[0].jobPostingStatus).toBe('SEARCHING_REPLACEMENT');
  });
});
