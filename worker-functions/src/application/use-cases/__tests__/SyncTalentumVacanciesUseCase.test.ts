/**
 * SyncTalentumVacanciesUseCase.test.ts
 *
 * Cobertura completa do use case de sync Talentum → Enlite.
 *
 * Cenarios:
 *  1. Sync com vacante existente (update)
 *  2. Sync com vacante nova (create)
 *  3. Titulo sem case_number (skip)
 *  4. Erro no Gemini nao aborta sync dos demais
 *  5. Paginacao (multiplas paginas)
 *  6. Update so sobreescreve campos nao-nulos
 *  7. Salva referencia Talentum apos create/update
 *  8. Report retorna totais corretos
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
jest.mock('../../../infrastructure/services/TalentumApiClient', () => ({
  TalentumApiClient: {
    create: jest.fn().mockResolvedValue({
      listAllPrescreenings: mockListAllPrescreenings,
    }),
  },
}));

const mockParseFromTalentumDescription = jest.fn();
jest.mock('../../../infrastructure/services/GeminiVacancyParserService', () => ({
  GeminiVacancyParserService: jest.fn().mockImplementation(() => ({
    parseFromTalentumDescription: mockParseFromTalentumDescription,
  })),
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
    questions: overrides.questions ?? [],
    faq: overrides.faq ?? [],
  };
}

function makeParsedVacancy(overrides: Record<string, any> = {}) {
  const has = (key: string) => key in overrides;
  return {
    case_number: has('case_number') ? overrides.case_number : 42,
    title: has('title') ? overrides.title : 'CASO 42',
    required_professions: has('required_professions') ? overrides.required_professions : ['AT'],
    required_sex: has('required_sex') ? overrides.required_sex : 'M',
    age_range_min: has('age_range_min') ? overrides.age_range_min : null,
    age_range_max: has('age_range_max') ? overrides.age_range_max : null,
    required_experience: has('required_experience') ? overrides.required_experience : 'experiencia con TEA',
    worker_attributes: has('worker_attributes') ? overrides.worker_attributes : null,
    schedule: has('schedule') ? overrides.schedule : [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
    work_schedule: has('work_schedule') ? overrides.work_schedule : 'part-time',
    pathology_types: has('pathology_types') ? overrides.pathology_types : 'TEA',
    dependency_level: has('dependency_level') ? overrides.dependency_level : null,
    service_device_types: has('service_device_types') ? overrides.service_device_types : ['DOMICILIARIO'],
    providers_needed: has('providers_needed') ? overrides.providers_needed : 1,
    salary_text: has('salary_text') ? overrides.salary_text : 'A convenir',
    payment_day: has('payment_day') ? overrides.payment_day : null,
    daily_obs: has('daily_obs') ? overrides.daily_obs : null,
    city: has('city') ? overrides.city : 'Recoleta',
    state: has('state') ? overrides.state : 'CABA',
    status: has('status') ? overrides.status : 'BUSQUEDA',
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('SyncTalentumVacanciesUseCase', () => {
  let useCase: SyncTalentumVacanciesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    useCase = new SyncTalentumVacanciesUseCase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Sync com vacante existente ────────────────────────────

  describe('update vacante existente', () => {
    it('deve atualizar vacancy quando talentum_project_id ja existe no DB (com force=true)', async () => {
      const project = makeTalentumProject({ projectId: 'proj-exist', title: 'CASO 10 - AT' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      const parsed = makeParsedVacancy({ case_number: 10, city: 'Palermo' });
      mockParseFromTalentumDescription.mockResolvedValue(parsed);

      // SELECT talentum_project_id → found
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-existing-1', talentum_project_id: 'proj-exist' }] }) // lookup
        .mockResolvedValueOnce({ rows: [] }) // UPDATE (updateFromSync)
        .mockResolvedValueOnce({ rows: [] }); // UPDATE (saveTalentumReference)

      const report = await useCase.execute({ force: true });

      expect(report.updated).toBe(1);
      expect(report.created).toBe(0);
      expect(report.skipped).toBe(0);
      expect(report.errors).toHaveLength(0);
      expect(report.total).toBe(1);
    });

    it('deve construir SET clause dinamico com apenas campos nao-nulos', async () => {
      const project = makeTalentumProject({ projectId: 'proj-5', title: 'CASO 5' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      // Parsed com muitos campos null
      const parsed = makeParsedVacancy({
        case_number: 5,
        required_sex: null,
        age_range_min: null,
        age_range_max: null,
        required_experience: null,
        worker_attributes: null,
        schedule: null,
        work_schedule: null,
        dependency_level: null,
        salary_text: null,
        payment_day: null,
        daily_obs: null,
        // Apenas estes nao-nulos:
        city: 'Belgrano',
        state: 'CABA',
        required_professions: ['AT'],
        pathology_types: 'Bipolaridad',
        service_device_types: ['DOMICILIARIO'],
        providers_needed: 2,
      });
      mockParseFromTalentumDescription.mockResolvedValue(parsed);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-5', talentum_project_id: 'proj-5' }] }) // lookup
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // saveTalentumReference

      await useCase.execute({ force: true });

      // O segundo query e o UPDATE — verificar que nao tem campos null
      const updateCall = mockQuery.mock.calls[1];
      const sql = updateCall[0] as string;
      const params = updateCall[1] as any[];

      // Deve conter apenas os 6 campos nao-nulos + id
      expect(sql).toContain('UPDATE job_postings SET');
      expect(sql).toContain('city =');
      expect(sql).toContain('state =');
      expect(sql).toContain('required_professions =');
      expect(sql).toContain('pathology_types =');
      expect(sql).toContain('providers_needed =');
      // Nao deve conter campos null
      expect(sql).not.toContain('required_sex =');
      expect(sql).not.toContain('age_range_min =');
      expect(sql).not.toContain('worker_attributes =');
      expect(sql).not.toContain('daily_obs =');

      // Ultimo parametro e o ID
      expect(params[params.length - 1]).toBe('jp-5');
    });

    it('nao deve chamar UPDATE se todos os campos parseados sao null/undefined', async () => {
      const project = makeTalentumProject({ projectId: 'proj-99', title: 'CASO 99' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      // updateFromSync filtra com `f.value != null` — null e undefined sao filtrados
      const allNullParsed = {
        case_number: 99,
        title: 'CASO 99',
        required_professions: undefined,
        required_sex: undefined,
        age_range_min: undefined,
        age_range_max: undefined,
        required_experience: undefined,
        worker_attributes: undefined,
        schedule: undefined,
        work_schedule: undefined,
        pathology_types: undefined,
        dependency_level: undefined,
        service_device_types: undefined,
        providers_needed: undefined,
        salary_text: undefined,
        payment_day: undefined,
        daily_obs: undefined,
        city: undefined,
        state: undefined,
        status: 'BUSQUEDA',
      };
      mockParseFromTalentumDescription.mockResolvedValue(allNullParsed);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-99', talentum_project_id: 'proj-99' }] }) // lookup
        .mockResolvedValueOnce({ rows: [] }); // saveTalentumReference

      await useCase.execute({ force: true });

      // Apenas 2 queries: lookup + saveTalentumReference (nenhum UPDATE de campos)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('deve fazer JSON.stringify para campos JSONB (schedule)', async () => {
      const project = makeTalentumProject({ projectId: 'proj-7', title: 'CASO 7' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      const scheduleData = [
        { dayOfWeek: 1, startTime: '08:00', endTime: '14:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '14:00' },
      ];
      const parsed = makeParsedVacancy({
        case_number: 7,
        schedule: scheduleData,
        city: null,
        state: null,
        required_sex: null,
        age_range_min: null,
        age_range_max: null,
        required_experience: null,
        worker_attributes: null,
        work_schedule: null,
        pathology_types: null,
        dependency_level: null,
        service_device_types: null,
        providers_needed: null,
        salary_text: null,
        payment_day: null,
        daily_obs: null,
        required_professions: null,
      });
      mockParseFromTalentumDescription.mockResolvedValue(parsed);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-7', talentum_project_id: 'proj-7' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await useCase.execute({ force: true });

      const updateParams = mockQuery.mock.calls[1][1] as any[];
      // schedule deve estar stringified
      expect(updateParams).toContain(JSON.stringify(scheduleData));
    });
  });

  // ── 2. Sync com vacante nova ─────────────────────────────────

  describe('criar vacante nova', () => {
    it('deve criar vacancy quando talentum_project_id nao existe no DB', async () => {
      const project = makeTalentumProject({ projectId: 'proj-new', title: 'CASO 100' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      const parsed = makeParsedVacancy({ case_number: 100 });
      mockParseFromTalentumDescription.mockResolvedValue(parsed);

      // SELECT talentum_project_id → not found
      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '42' }] })          // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-new-100' }] })  // INSERT RETURNING id
        .mockResolvedValueOnce({ rows: [] });                      // saveTalentumReference

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.updated).toBe(0);
    });

    it('deve inserir com status BUSQUEDA e country AR', async () => {
      const project = makeTalentumProject({ title: 'CASO 200' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 200 }));

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

    it('deve usar defaults para campos nao parseados no INSERT', async () => {
      const project = makeTalentumProject({ title: 'CASO 300' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      // createFromSync usa ?? para defaults: null → default value
      const parsed = makeParsedVacancy({
        case_number: 300,
        required_professions: null,  // → [] (via ?? [])
        providers_needed: null,       // → 1 (via ?? 1)
        salary_text: null,            // → 'A convenir' (via ?? 'A convenir')
      });
      mockParseFromTalentumDescription.mockResolvedValue(parsed);

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '7' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-300' }] })
        .mockResolvedValueOnce({ rows: [] });

      await useCase.execute();

      const insertParams = mockQuery.mock.calls[3][1] as any[];
      // $1=vacancyNumber, $2=caseNumber, $3=title, $4=required_professions → default []
      expect(insertParams[3]).toEqual([]);
      // $15=providers_needed → default 1 (null ?? 1)
      expect(insertParams[14]).toBe(1);
      // $16=salary_text → default 'A convenir' (null ?? 'A convenir')
      expect(insertParams[15]).toBe('A convenir');
    });

    it('deve gerar titulo "CASO {caseNumber}-{vacancyNumber}" no INSERT', async () => {
      const project = makeTalentumProject({ title: 'CASO 55' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 55 }));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '99' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-55' }] })
        .mockResolvedValueOnce({ rows: [] });

      await useCase.execute();

      const insertParams = mockQuery.mock.calls[3][1] as any[];
      // $1=vacancyNumber, $2=caseNumber, $3=title
      expect(insertParams[0]).toBe(99);
      expect(insertParams[1]).toBe(55);
      expect(insertParams[2]).toBe('CASO 55-99');
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

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: null }));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                      // lookup (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '5' }] })          // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-generic' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] });                     // saveTalentumReference

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);
      expect(mockParseFromTalentumDescription).toHaveBeenCalled();

      // INSERT deve ter case_number=null e titulo "VACANTE {vn}"
      const insertParams = mockQuery.mock.calls[2][1] as any[];
      expect(insertParams[1]).toBeNull();  // case_number
      expect(insertParams[2]).toBe('VACANTE 5'); // title
    });

    it('deve criar vacancy com case_number=null quando titulo esta vazio', async () => {
      const project = makeTalentumProject({ projectId: 'proj-empty', title: '' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: null }));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ vn: '6' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-empty' }] })
        .mockResolvedValueOnce({ rows: [] });

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);
    });

    it('deve aceitar CASO case-insensitive', async () => {
      const project = makeTalentumProject({ title: 'caso 88 - AT' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 88 }));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                       // lookup por talentum_project_id
        .mockResolvedValueOnce({ rows: [] })                       // lookup por case_number
        .mockResolvedValueOnce({ rows: [{ vn: '20' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-88' }] })
        .mockResolvedValueOnce({ rows: [] });

      const report = await useCase.execute();

      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);
    });
  });

  // ── 4. Erro no Gemini nao aborta sync ────────────────────────

  describe('resiliencia a erros individuais', () => {
    it('deve continuar sync quando Gemini falha em um project', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'proj-fail', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'proj-ok', title: 'CASO 2' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      // Both run in parallel in same batch — use implementation
      mockParseFromTalentumDescription.mockImplementation((_desc: string, title: string) => {
        if (title.includes('CASO 1')) return Promise.reject(new Error('Gemini API error 500: internal'));
        return Promise.resolve(makeParsedVacancy({ case_number: 2 }));
      });

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] }); // lookup: not found
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new-2' }] });
        return Promise.resolve({ rows: [] });
      });

      const report = await useCase.execute();

      expect(report.total).toBe(2);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].projectId).toBe('proj-fail');
      expect(report.errors[0].error).toContain('Gemini');
      expect(report.created).toBe(1);
    });

    it('deve registrar erro quando DB query falha', async () => {
      const project = makeTalentumProject({ projectId: 'proj-db-fail', title: 'CASO 50' });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 50 }));

      // lookup OK mas UPDATE falha (force=true para atingir path de update)
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-50', talentum_project_id: 'proj-db-fail' }] })
        .mockRejectedValueOnce(new Error('connection refused'));

      const report = await useCase.execute({ force: true });

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].error).toContain('connection refused');
    });

    it('deve registrar projectId e title no erro', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-x',
        title: 'CASO 77 - fallido',
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockRejectedValue(new Error('timeout'));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })  // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] }); // lookup por case_number (not found)

      const report = await useCase.execute();

      expect(report.errors[0]).toEqual({
        projectId: 'proj-x',
        title: 'CASO 77 - fallido',
        error: 'timeout',
      });
    });
  });

  // ── 5. Paginacao ─────────────────────────────────────────────

  describe('paginacao', () => {
    it('deve processar todos os projects de multiplas paginas', async () => {
      const projects = [
        makeTalentumProject({ projectId: 'p1', title: 'CASO 1' }),
        makeTalentumProject({ projectId: 'p2', title: 'CASO 2' }),
        makeTalentumProject({ projectId: 'p3', title: 'CASO 3' }),
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy());

      // Parallel batches — respond based on SQL type
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] }); // not found → create
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-auto' }] });
        return Promise.resolve({ rows: [] }); // UPDATE (saveTalentumReference)
      });

      const report = await useCase.execute();

      expect(report.total).toBe(3);
      expect(report.created).toBe(3);
      expect(mockParseFromTalentumDescription).toHaveBeenCalledTimes(3);
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

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 60 }));

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                    // lookup por talentum_project_id (not found)
        .mockResolvedValueOnce({ rows: [] })                    // lookup por case_number (not found)
        .mockResolvedValueOnce({ rows: [{ vn: '30' }] })       // nextval
        .mockResolvedValueOnce({ rows: [{ id: 'jp-60' }] })    // INSERT
        .mockResolvedValueOnce({ rows: [] });                   // saveTalentumReference

      await useCase.execute();

      // Find the saveTalentumReference call (UPDATE SET talentum_project_id)
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
      // force=false: found → skip, not-found → create
      const projects = [
        makeTalentumProject({ projectId: 'p-skip', title: 'CASO 1' }),   // found → skip
        makeTalentumProject({ projectId: 'p-create', title: 'CASO 2' }), // not found → create
        makeTalentumProject({ projectId: 'p-fail', title: 'CASO 4' }),   // not found, Gemini fails
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockParseFromTalentumDescription.mockImplementation((_desc: string, title: string) => {
        if (title.includes('CASO 4')) return Promise.reject(new Error('Gemini down'));
        const cn = parseInt(title.match(/CASO\s+(\d+)/i)?.[1] || '0');
        return Promise.resolve(makeParsedVacancy({ case_number: cn }));
      });

      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'p-skip') {
          return Promise.resolve({ rows: [{ id: 'jp-1', talentum_project_id: 'p-skip' }] }); // found → skip
        }
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] }); // not found → create
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new' }] });
        return Promise.resolve({ rows: [] }); // UPDATE (saveTalentumReference)
      });

      const report = await useCase.execute();

      expect(report.total).toBe(3);
      expect(report.updated).toBe(0);
      expect(report.created).toBe(1);
      expect(report.skipped).toBe(1);
      expect(report.errors).toHaveLength(1);
    });

    it('deve retornar updated quando force=true e talentum_project_id ja synced', async () => {
      // force=true: found → update, not-found → create
      const projects = [
        makeTalentumProject({ projectId: 'p-update', title: 'CASO 1' }), // found → update
        makeTalentumProject({ projectId: 'p-create', title: 'CASO 2' }), // not found → create
        makeTalentumProject({ projectId: 'p-fail', title: 'CASO 4' }),   // not found, Gemini fails
      ];
      mockListAllPrescreenings.mockResolvedValue(projects);

      mockParseFromTalentumDescription.mockImplementation((_desc: string, title: string) => {
        if (title.includes('CASO 4')) return Promise.reject(new Error('Gemini down'));
        const cn = parseInt(title.match(/CASO\s+(\d+)/i)?.[1] || '0');
        return Promise.resolve(makeParsedVacancy({ case_number: cn }));
      });

      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT') && sql.includes('talentum_project_id') && params?.[0] === 'p-update') {
          return Promise.resolve({ rows: [{ id: 'jp-1', talentum_project_id: 'p-update' }] }); // found → update
        }
        if (sql.includes('SELECT') && sql.includes('talentum_project_id')) {
          return Promise.resolve({ rows: [] }); // not found → create
        }
        if (sql.includes('nextval')) return Promise.resolve({ rows: [{ vn: '1' }] });
        if (sql.includes('INSERT')) return Promise.resolve({ rows: [{ id: 'jp-new' }] });
        return Promise.resolve({ rows: [] }); // UPDATE
      });

      const report = await useCase.execute({ force: true });

      expect(report.total).toBe(3);
      expect(report.updated).toBe(1);
      expect(report.created).toBe(1);
      expect(report.skipped).toBe(0);
      expect(report.errors).toHaveLength(1);
    });
  });

  // ── 8. Chamada ao parseFromTalentumDescription ───────────────

  describe('chamada ao Gemini', () => {
    it('deve passar description e title do project para o parser', async () => {
      const project = makeTalentumProject({
        projectId: 'proj-42',
        title: 'CASO 42 - AT Recoleta',
        description: 'Texto completo da descricao Talentum...',
      });
      mockListAllPrescreenings.mockResolvedValue([project]);

      mockParseFromTalentumDescription.mockResolvedValue(makeParsedVacancy({ case_number: 42 }));

      // lookup → found; force=true so Gemini is called and update proceeds
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'jp-42', talentum_project_id: 'proj-42' }] }) // lookup
        .mockResolvedValueOnce({ rows: [] }) // UPDATE (updateFromSync)
        .mockResolvedValueOnce({ rows: [] }); // saveTalentumReference

      await useCase.execute({ force: true });

      expect(mockParseFromTalentumDescription).toHaveBeenCalledWith(
        'Texto completo da descricao Talentum...',
        'CASO 42 - AT Recoleta',
      );
    });
  });
});
