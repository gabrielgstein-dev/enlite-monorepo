import { describe, it, expect } from 'vitest';
import ptBR from '@infrastructure/i18n/locales/pt-BR.json';
import es from '@infrastructure/i18n/locales/es.json';

// ── Helpers ────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flattenKeys(v, path) : [path];
  });
}

// ── Extract workers keys from locale files ─────────────────────────────────

const ptBRWorkers = (ptBR as Record<string, any>).admin.workers;
const esWorkers = (es as Record<string, any>).admin.workers;

const ptBRAllKeys = flattenKeys(ptBRWorkers);
const esAllKeys = flattenKeys(esWorkers);

// ── All i18n keys used in AdminWorkers components ──────────────────────────

const REQUIRED_KEYS = [
  // AdminWorkersPage
  'title',
  'listTitle',
  'errorLoading',
  'noWorkers',
  'platformLabel',
  'docsLabel',
  'pagination',
  'previousPage',
  'nextPage',
  // Table headers
  'table.name',
  'table.cases',
  'table.documents',
  'table.registeredAt',
  'table.platform',
  'table.view',
  // Platform options
  'platformOptions.all',
  'platformOptions.talentum',
  'platformOptions.planillaOperativa',
  'platformOptions.anaCare',
  'platformOptions.enliteApp',
  // Docs filter options
  'docsOptions.all',
  'docsOptions.complete',
  'docsOptions.incomplete',
  // Docs status badges
  'docsStatus.complete',
  'docsStatus.rejected',
  'docsStatus.pending',
  'docsStatus.incomplete',
  // Stats cards
  'stats.today',
  'stats.yesterday',
  'stats.sevenDays',
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminWorkers i18n — key completeness', () => {
  it.each(REQUIRED_KEYS)(
    'pt-BR has translation for key "%s"',
    (key) => {
      const value = getNestedValue(ptBRWorkers, key);
      expect(value).toBeDefined();
      expect(String(value).trim().length).toBeGreaterThan(0);
    },
  );

  it.each(REQUIRED_KEYS)(
    'es has translation for key "%s"',
    (key) => {
      const value = getNestedValue(esWorkers, key);
      expect(value).toBeDefined();
      expect(String(value).trim().length).toBeGreaterThan(0);
    },
  );
});

describe('AdminWorkers i18n — locale parity', () => {
  it('pt-BR and es have the same set of workers keys', () => {
    const ptBRSet = new Set(ptBRAllKeys);
    const esSet = new Set(esAllKeys);

    const missingInEs = ptBRAllKeys.filter((k) => !esSet.has(k));
    const missingInPtBR = esAllKeys.filter((k) => !ptBRSet.has(k));

    expect(missingInEs).toEqual([]);
    expect(missingInPtBR).toEqual([]);
  });
});

describe('AdminWorkers i18n — translations are user-friendly', () => {
  it.each(REQUIRED_KEYS)(
    'pt-BR translation for "%s" is not the raw key',
    (key) => {
      const value = getNestedValue(ptBRWorkers, key);
      expect(value).not.toBe(key);
      expect(value).not.toBe(`admin.workers.${key}`);
    },
  );

  it.each(REQUIRED_KEYS)(
    'es translation for "%s" is not the raw key',
    (key) => {
      const value = getNestedValue(esWorkers, key);
      expect(value).not.toBe(key);
      expect(value).not.toBe(`admin.workers.${key}`);
    },
  );

  it('pt-BR translations contain Portuguese-language labels', () => {
    expect(ptBRWorkers.listTitle).toBe('Lista de Prestadores');
    expect(ptBRWorkers.noWorkers).toBe('Nenhum prestador encontrado');
    expect(ptBRWorkers.docsLabel).toBe('Documentação');
    expect(ptBRWorkers.previousPage).toBe('Página anterior');
    expect(ptBRWorkers.stats.today).toBe('Cadastros Hoje');
    expect(ptBRWorkers.docsStatus.rejected).toBe('Rejeitado');
    expect(ptBRWorkers.docsStatus.pending).toBe('Pendente');
    expect(ptBRWorkers.table.name).toBe('Nome');
  });

  it('es translations contain Spanish-language labels', () => {
    expect(esWorkers.listTitle).toBe('Lista de Prestadores');
    expect(esWorkers.noWorkers).toBe('No se encontraron prestadores');
    expect(esWorkers.docsLabel).toBe('Documentación');
    expect(esWorkers.nextPage).toBe('Página siguiente');
    expect(esWorkers.stats.today).toBe('Registros Hoy');
    expect(esWorkers.docsStatus.rejected).toBe('Rechazado');
    expect(esWorkers.docsStatus.pending).toBe('Pendiente');
    expect(esWorkers.table.name).toBe('Nombre');
  });
});

// ── Guard: label must be "Prestador", never "Worker" ──────────────────────

const esNav = (es as Record<string, any>).admin.nav;
const ptBRNav = (ptBR as Record<string, any>).admin.nav;

const PRESTADOR_KEYS_WORKERS = ['title', 'listTitle', 'errorLoading', 'noWorkers'] as const;

describe('AdminWorkers i18n — "Prestador" label guard', () => {
  it('es nav.workers label is "Prestadores"', () => {
    expect(esNav.workers).toBe('Prestadores');
  });

  it('pt-BR nav.workers label is "Prestadores"', () => {
    expect(ptBRNav.workers).toBe('Prestadores');
  });

  it.each(PRESTADOR_KEYS_WORKERS)(
    'es admin.workers.%s uses "Prestador/prestador", never "Worker/worker"',
    (key) => {
      const value = getNestedValue(esWorkers, key) as string;
      expect(value).not.toMatch(/worker/i);
      expect(value).toMatch(/prestador/i);
    },
  );

  it.each(PRESTADOR_KEYS_WORKERS)(
    'pt-BR admin.workers.%s uses "Prestador/prestador", never "Worker/worker"',
    (key) => {
      const value = getNestedValue(ptBRWorkers, key) as string;
      expect(value).not.toMatch(/worker/i);
      expect(value).toMatch(/prestador/i);
    },
  );
});
