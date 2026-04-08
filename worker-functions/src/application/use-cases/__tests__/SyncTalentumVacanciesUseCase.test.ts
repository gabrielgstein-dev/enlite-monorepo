/**
 * SyncTalentumVacanciesUseCase.test.ts
 *
 * Cobertura do use case de sync Talentum → Enlite (sem Gemini).
 *
 * Cenarios:
 *  1. Sync com vacante existente (update reference only)
 *  2. Sync com vacante nova (create)
 *  3. Titulo sem case_number
 *  4. Erro individual nao aborta sync dos demais
 *  5. Multiplos projects
 *  6. Salva referencia Talentum apos create/update
 *  7. Report retorna totais corretos
 *  8. Sync questions e FAQ
 */

// ── Mocks (antes dos imports) ────────────────────────────────────

const mockQuery = jest.fn();

jest.mock('../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: mockQuery,
      }),
    }),
  },
}));

const mockListAllPrescreenings = jest.fn();
const mockGetPrescreening = jest.fn();
jest.mock('../../../infrastructure/services/TalentumApiClient', () => ({
  TalentumApiClient: {
    create: jest.fn().mockResolvedValue({
      listAllPrescreenings: mockListAllPrescreenings,
      getPrescreening: mockGetPrescreening,
    }),
  },
}));

// ── Imports ──────────────────────────────────────────────────────

import { SyncTalentumVacanciesUseCase, SyncReport } from '../SyncTalentumVacanciesUseCase';
import type { TalentumProject } from '../../../domain/interfaces/ITalentumApiClient';

// ── Helpers ──────────────────────────────────────────────────────

function makeTalentumProject(overrides: Partial<TalentumProject> = {}): TalentumProject {
  return {
    projectId: overrides.projectId ?? 'proj-1',
    publicId: overrides.publicId ?? 'pub-1',
    title: overrides.title ?? 'CASO 42 - AT Recoleta',
    description: overrides.description ?? 'Descripcion de la Propuesta: paciente adulto...',
    whatsappUrl: overrides.whatsappUrl ?? 'https://wa.me/talentum/proj-1',
    slug: overrides.slug ?? 'caso-42-at-recoleta',
    active: overrides.active ?? true,
    timestamp: overrides.timestamp ?? '2025-01-15T10:00:00Z',
    questions: overrides.questions ?? [
      { questionId: 'q1', question: 'Tiene experiencia?', type: 'text' as const, responseType: ['text' as const], desiredResponse: 'Si', weight: 5, required: false, analyzed: true, earlyStoppage: false },
    ],
    faq: overrides.faq ?? [
      { question: 'Cual es el horario?', answer: 'Lunes a viernes 9 a 17' },
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('SyncTalentumVacanciesUseCase', () => {
  let useCase: SyncTalentumVacanciesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    mockQuery.mockResolvedValue({ rows: [] });
    useCase = new SyncTalentumVacanciesUseCase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Sync com vacante existente ────────────────────────────

  describe('update vacante existente', () => {
    it('deve atualizar referencia quando talentum_project_id ja existe no DB (com force=true)', async () => {
      const project = makeTalentumProject({ projectId: 'proj-exist', title: 'CASO 10 - AT' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      // SELECT talentum_project_id → found
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-existing-1', talentum_project_id: 'proj-exist' }] }) // lookup
        .mockResolvedValueOnce({ rows: [] }) // saveTalentumReference
        .mockResolvedValueOnce({ rows: [] }) // DELETE questions
        .mockResolvedValueOnce({ rows: [] }) // INSERT question
        .mockResolvedValueOnce({ rows: [] }) // DELETE faq
        .mockResolvedValueOnce({ rows: [] }); // INSERT faq

      const report = await useCase.execute({ force: true });

      expect(report.updated).toBe(1);
      expect(report.created).toBe(0);
      expect(report.skipped).toBe(0);
      expect(report.errors).toHaveLength(0);
      expect(report.total).toBe(1);
    });

    it('deve skip sem chamar Gemini quando ja synced e force=false', async () => {
      const project = makeTalentumProject({ projectId: 'proj-exist', title: 'CASO 10' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-1', talentum_project_id: 'proj-exist' }] });

      const report = await useCase.execute({ force: false });

      expect(report.skipped).toBe(1);
      expect(report.updated).toBe(0);
      expect(report.created).toBe(0);
    });
  });

  // ── 2. Sync com vacante nova ─────────────────────────────────

  describe('criar vacante nova', () => {
    it('deve criar vacancy quando talentum_project_id nao existe no DB', async () => {
      const project = makeTalentumProject({ projectId: 'proj-new', title: 'CASO 100' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '42' }] })          // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-new-100' }] })  // INSERT RETURNING id
        .mockResolvedValueOnce({ rows: [] })                       // saveTalentumReference
        .mockResolvedValueOnce({ rows: [] })                       // DELETE questions
        .mockResolvedValueOnce({ rows: [] })                       // INSERT question
        .mockResolvedValueOnce({ rows: [] })                       // DELETE faq
        .mockResolvedValueOnce({ rows: [] });                      // INSERT faq

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.updated).toBe(0);
    });

    it('deve inserir com status BUSQUEDA e country AR', async () => {
      const project = makeTalentumProject({ title: 'CASO 200' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '10' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-200' }] })
        .mockResolvedValueOnce({ rows: [] });

      await useCase.execute();

      const insertCall = mockQuery.mock.calls[3];
      const sql = insertCall[0] as string;
      expect(sql).toContain('INSERT INTO job_postings');
      expect(sql).toContain("'AR'");
      expect(sql).toContain("'BUSQUEDA'");
    });

    it('deve gerar titulo "CASO {caseNumber}-{vacancyNumber}" no INSERT', async () => {
      const project = makeTalentumProject({ title: 'CASO 55' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '99' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-55' }] })
        .mockResolvedValueOnce({ rows: [] });

      await useCase.execute();

      const insertParams = mockQuery.mock.calls[3][1] as any[];
      expect(insertParams[0]).toBe(99);  // vacancy_number
      expect(insertParams[1]).toBe(55);  // case_number
      expect(insertParams[2]).toBe('CASO 55-99'); // title
    });
  });

  // ── 3. Titulo sem case_number ────────────────────────────────

  describe('titulo sem case_number', () => {
    it('deve criar vacancy com case_number=null quando titulo nao tem CASO', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-generic',
        title: 'Proyecto generico sin numero',
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                      // lookup (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '5' }] })          // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-generic' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] });                     // saveTalentumReference

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);

      // INSERT deve ter case_number=null e titulo "VACANTE {vn}"
      const insertParams = mockQuery.mock.calls[2][1] as any[];
      expect(insertParams[1]).toBeNull();  // case_number
      expect(insertParams[2]).toBe('VACANTE 5'); // title
    });

    it('deve aceitar CASO case-insensitive', async () => {
      const project = makeTalentumProject({ title: 'caso 88 - AT' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '20' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-88' }] })
        .mockResolvedValueOnce({ rows: [] });

      const report = await useCase.execute();

      expect(report.created).toBe(1);
    });
  });

  // ── 4. Resiliencia a erros individuais ──────────────────────

  describe('resiliencia a erros individuais', () => {
    it('deve continuar sync quando um project falha', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'proj-fail', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'proj-ok', title: 'CASO 2' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      let callCount = 0;
      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        // First project: lookup finds nothing, then creation fails
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'proj-fail') {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'proj-ok') {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('case_number') && sql.includes('SELECT')) {
          callCount++;
          if (callCount === 1) {
            // First project case_number lookup succeeds, but nextval will fail
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('nextval')) {
          callCount++;
          if (callCount <= 3) return Promise.reject(new Error('DB connection lost'));
          return Promise.resolve({ rows: [{ vn: '1' }] });
        }
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new-2' }] });
        return Promise.resolve({ rows: [] });
      });

      const report = await useCase.execute();

      expect(report.total).toBe(2);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].projectId).toBe('proj-fail');
    });

    it('deve registrar projectId e title no erro', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-x',
        title: 'CASO 77 - fallido',
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })  // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] })  // lookup por case_number (not found)
        .mockRejectedValueOnce(new Error('timeout')); // nextval fails

      const report = await useCase.execute();

      expect(report.errors[0]).toEqual({
        projectId: 'proj-x',
        title: 'CASO 77 - fallido',
        error: 'timeout',
      });
    });
  });

  // ── 5. Multiplos projects ───────────────────────────────────

  describe('multiplos projects', () => {
    it('deve processar todos os projects', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'p1', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'p2', title: 'CASO 2' }),
        makeTalentumProject({ projectId: 'p3', title: 'CASO 3' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-auto' }] });
        return Promise.resolve({ rows: [] });
      });

      const report = await useCase.execute();

      expect(report.total).toBe(3);
      expect(report.created).toBe(3);
    });

    it('deve retornar total=0 quando nao ha projects', async () => {
      mockListAllPrescreenings.mockResolvedValue([]);

      const report = await useCase.execute();

      expect(report.total).toBe(0);
      expect(report.updated).toBe(0);
      expect(report.created).toBe(0);
      expect(report.skipped).toBe(0);
      expect(report.errors).toHaveLength(0);
    });
  });

  // ── 6. Salva referencia Talentum ─────────────────────────────

  describe('saveTalentumReference', () => {
    it('deve salvar projectId, publicId, whatsappUrl, slug, timestamp e description', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-ref',
        publicId: 'pub-ref',
        title: 'CASO 60',
        description: 'Descripcion completa...',
        whatsappUrl: 'https://wa.me/ref',
        slug: 'caso-60-ref',
        timestamp: '2025-06-01T12:00:00Z',
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                    // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] })                    // lookup por case_number (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '30' }] })       // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-60' }] })    // INSERT
        .mockResolvedValueOnce({ rows: [] });                   // saveTalentumReference

      await useCase.execute();

      const refCall = mockQuery.mock.calls.find(
        (call: any[]) => (call[0] as string).includes('SET talentum_project_id'),
      );
      expect(refCall).toBeDefined();
      const refParams = refCall![1] as any[];

      expect(refParams[0]).toBe('proj-ref');
      expect(refParams[1]).toBe('pub-ref');
      expect(refParams[2]).toBe('https://wa.me/ref');
      expect(refParams[3]).toBe('caso-60-ref');
      expect(refParams[4]).toBe('2025-06-01T12:00:00Z');
      expect(refParams[5]).toBe('Descripcion completa...');
      expect(refParams[6]).toBe('jp-60');
    });
  });

  // ── 7. Report completo ───────────────────────────────────────

  describe('relatorio final', () => {
    it('deve retornar skipped quando talentum_project_id ja synced (sem force)', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'p-skip', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'p-create', title: 'CASO 2' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'p-skip') {
          return Promise.resolve({ rows: [{ id: 'jp-1', talentum_project_id: 'p-skip' }] });
        }
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new' }] });
        return Promise.resolve({ rows: [] });
      });

      const report = await useCase.execute();

      expect(report.total).toBe(2);
      expect(report.skipped).toBe(1);
      expect(report.created).toBe(1);
      expect(report.updated).toBe(0);
    });

    it('deve retornar updated quando force=true e talentum_project_id ja synced', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'p-update', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'p-create', title: 'CASO 2' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'p-update') {
          return Promise.resolve({ rows: [{ id: 'jp-1', talentum_project_id: 'p-update' }] });
        }
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new' }] });
        return Promise.resolve({ rows: [] });
      });

      const report = await useCase.execute({ force: true });

      expect(report.total).toBe(2);
      expect(report.updated).toBe(1);
      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);
    });
  });

  // ── 8. Sync questions e FAQ ─────────────────────────────────

  describe('sync questions e FAQ', () => {
    it('deve sincronizar questions e FAQ da Talentum', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-q',
        title: 'CASO 10',
        questions: [
          { questionId: 'q1', question: 'Pregunta 1?', type: 'text' as const, responseType: ['text' as const], desiredResponse: 'Si', weight: 5, required: true, analyzed: true, earlyStoppage: false },
          { questionId: 'q2', question: 'Pregunta 2?', type: 'text' as const, responseType: ['audio' as const], desiredResponse: 'No', weight: 3, required: false, analyzed: false, earlyStoppage: true },
        ],
        faq: [
          { question: 'FAQ 1?', answer: 'Respuesta 1' },
        ],
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '1' }] })           // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-q' }] })        // INSERT
        .mockResolvedValueOnce({ rows: [] })                       // saveTalentumReference
        .mockResolvedValueOnce({ rows: [] })                       // DELETE questions
        .mockResolvedValueOnce({ rows: [] })                       // INSERT question 1
        .mockResolvedValueOnce({ rows: [] })                       // INSERT question 2
        .mockResolvedValueOnce({ rows: [] })                       // DELETE faq
        .mockResolvedValueOnce({ rows: [] });                      // INSERT faq 1

      await useCase.execute();

      // Verify DELETE + INSERT for questions
      const deleteQCall = mockQuery.mock.calls.find(
        (call: any[]) => (call[0] as string).includes('DELETE FROM job_posting_prescreening_questions'),
      );
      expect(deleteQCall).toBeDefined();

      const insertQCalls = mockQuery.mock.calls.filter(
        (call: any[]) => (call[0] as string).includes('INSERT INTO job_posting_prescreening_questions'),
      );
      expect(insertQCalls).toHaveLength(2);

      // Verify DELETE + INSERT for FAQ
      const deleteFaqCall = mockQuery.mock.calls.find(
        (call: any[]) => (call[0] as string).includes('DELETE FROM job_posting_prescreening_faq'),
      );
      expect(deleteFaqCall).toBeDefined();

      const insertFaqCalls = mockQuery.mock.calls.filter(
        (call: any[]) => (call[0] as string).includes('INSERT INTO job_posting_prescreening_faq'),
      );
      expect(insertFaqCalls).toHaveLength(1);
    });

    it('deve pular sync de questions/FAQ quando nao existem', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-no-q',
        title: 'CASO 20',
        questions: [],
        faq: [],
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup
        .mockResolvedValueOnce({ rows: [] })                       // lookup case_number
        .mockResolvedValueOnce({ rows: [{ vn: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-no-q' }] })
        .mockResolvedValueOnce({ rows: [] });                      // saveTalentumReference

      await useCase.execute();

      const deleteQCalls = mockQuery.mock.calls.filter(
        (call: any[]) => (call[0] as string).includes('DELETE FROM job_posting_prescreening'),
      );
      expect(deleteQCalls).toHaveLength(0);
    });
  });
});
