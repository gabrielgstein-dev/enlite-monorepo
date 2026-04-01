import { describe, it, expect } from 'vitest';
import ptBR from '@infrastructure/i18n/locales/pt-BR.json';
import es from '@infrastructure/i18n/locales/es.json';

// ── Extract workerDetail keys from locale files ─────────────────────────────

const ptBRKeys = Object.keys(
  (ptBR as Record<string, any>).admin.workerDetail,
);
const esKeys = Object.keys(
  (es as Record<string, any>).admin.workerDetail,
);

const ptBRTranslations = (ptBR as Record<string, any>).admin
  .workerDetail as Record<string, string>;
const esTranslations = (es as Record<string, any>).admin
  .workerDetail as Record<string, string>;

// ── All i18n keys used in WorkerDetail components ───────────────────────────

const REQUIRED_KEYS = [
  // WorkerStatusCard
  'status',
  'statusLabel',
  'eligibility',
  'matchable',
  'notMatchable',
  'active',
  'inactive',
  'platform',
  'dataSources',
  'createdAt',
  'updatedAt',
  // WorkerPersonalCard
  'personalData',
  'phone',
  'whatsapp',
  'birthDate',
  'document',
  'sex',
  'gender',
  // WorkerProfessionalCard
  'professionalData',
  'profession',
  'occupation',
  'knowledgeLevel',
  'titleCertificate',
  'yearsExperience',
  'preferredAgeRange',
  'experienceTypes',
  'preferredTypes',
  'languages',
  'viewProfile',
  // WorkerLocationCard
  'location',
  'address',
  'city',
  'workZone',
  'interestZone',
  'serviceAreas',
  'radius',
  'noLocation',
  // WorkerDocumentsCard
  'documents',
  'noDocuments',
  'docType',
  'docLink',
  'viewDoc',
  'resume',
  'identityDoc',
  'criminalRecord',
  'professionalReg',
  'insurance',
  'certificate',
  'reviewNotes',
  // WorkerEncuadresCard
  'encuadres',
  'noEncuadres',
  'case',
  'patient',
  'result',
  'interview',
  'recruiter',
  'date',
  // WorkerDetailPage
  'notFound',
  'back',
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WorkerDetail i18n — key completeness', () => {
  it.each(REQUIRED_KEYS)(
    'pt-BR has translation for key "%s"',
    (key) => {
      expect(ptBRKeys).toContain(key);
      expect(ptBRTranslations[key]).toBeDefined();
      expect(ptBRTranslations[key].trim().length).toBeGreaterThan(0);
    },
  );

  it.each(REQUIRED_KEYS)(
    'es has translation for key "%s"',
    (key) => {
      expect(esKeys).toContain(key);
      expect(esTranslations[key]).toBeDefined();
      expect(esTranslations[key].trim().length).toBeGreaterThan(0);
    },
  );
});

describe('WorkerDetail i18n — locale parity', () => {
  it('pt-BR and es have the same set of workerDetail keys', () => {
    const ptBRSet = new Set(ptBRKeys);
    const esSet = new Set(esKeys);

    const missingInEs = ptBRKeys.filter((k) => !esSet.has(k));
    const missingInPtBR = esKeys.filter((k) => !ptBRSet.has(k));

    expect(missingInEs).toEqual([]);
    expect(missingInPtBR).toEqual([]);
  });
});

describe('WorkerDetail i18n — translations are user-friendly', () => {
  it.each(REQUIRED_KEYS)(
    'pt-BR translation for "%s" is not the raw key',
    (key) => {
      const value = ptBRTranslations[key];
      // The translation should not be just the camelCase key
      expect(value).not.toBe(key);
      expect(value).not.toBe(`admin.workerDetail.${key}`);
    },
  );

  it.each(REQUIRED_KEYS)(
    'es translation for "%s" is not the raw key',
    (key) => {
      const value = esTranslations[key];
      expect(value).not.toBe(key);
      expect(value).not.toBe(`admin.workerDetail.${key}`);
    },
  );

  it('pt-BR translations contain Portuguese-language labels', () => {
    expect(ptBRTranslations.personalData).toBe('Dados Pessoais');
    expect(ptBRTranslations.professionalData).toBe('Dados Profissionais');
    expect(ptBRTranslations.phone).toBe('Telefone');
    expect(ptBRTranslations.birthDate).toBe('Data de nascimento');
    expect(ptBRTranslations.documents).toBe('Documentos');
    expect(ptBRTranslations.location).toBe('Localização');
    expect(ptBRTranslations.back).toBe('Voltar');
    expect(ptBRTranslations.notFound).toBe('Worker não encontrado');
    expect(ptBRTranslations.noEncuadres).toBe('Nenhum encuadre registrado');
    expect(ptBRTranslations.noDocuments).toBe('Nenhum documento registrado');
    expect(ptBRTranslations.noLocation).toBe('Nenhuma localização registrada');
  });

  it('es translations contain Spanish-language labels', () => {
    expect(esTranslations.personalData).toBe('Datos Personales');
    expect(esTranslations.professionalData).toBe('Datos Profesionales');
    expect(esTranslations.phone).toBe('Teléfono');
    expect(esTranslations.birthDate).toBe('Fecha de nacimiento');
    expect(esTranslations.documents).toBe('Documentos');
    expect(esTranslations.location).toBe('Ubicación');
    expect(esTranslations.back).toBe('Volver');
    expect(esTranslations.notFound).toBe('Worker no encontrado');
    expect(esTranslations.noEncuadres).toBe('Sin encuadres registrados');
    expect(esTranslations.noDocuments).toBe('Sin documentos registrados');
    expect(esTranslations.noLocation).toBe('Sin ubicación registrada');
  });
});
