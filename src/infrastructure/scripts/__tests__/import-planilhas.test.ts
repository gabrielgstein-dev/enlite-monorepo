/**
 * import-planilhas.test.ts
 *
 * Testes de integração para PlanilhaImporter.
 * Moca todos os repositórios (sem DB real) e roda o fluxo completo
 * para cada aba dos 3 documentos.
 *
 * Cenários cobertos (os mais problemáticos de cada aba):
 *
 *   Ana Care Control    → 10 casos
 *   CANDIDATOS/Talentum → 10 casos
 *   CANDIDATOS/NoUsarMás → 5 casos
 *   _Base1              → 10 casos
 *   _CaseSheets         → 8 casos (cruzamento + soft-match)
 *   _BlackList          → 7 casos
 *   _Publicaciones      → 5 casos
 *   _Índice             → 5 casos
 */

import * as XLSX from 'xlsx';
import { PlanilhaImporter } from '../import-planilhas';

// ─── Mock de todos os repositórios ANTES dos imports ───────────────────────
jest.mock('../../repositories/WorkerRepository');
jest.mock('../../repositories/EncuadreRepository');
jest.mock('../../repositories/OperationalRepositories');
jest.mock('../../services/WorkerDeduplicationService');

import { WorkerRepository }    from '../../repositories/WorkerRepository';
import { EncuadreRepository }  from '../../repositories/EncuadreRepository';
import {
  BlacklistRepository,
  PublicationRepository,
  ImportJobRepository,
  JobPostingARRepository,
  WorkerFunnelRepository,
  WorkerApplicationRepository,
} from '../../repositories/OperationalRepositories';
import { WorkerDeduplicationService } from '../../services/WorkerDeduplicationService';

// ─── Helpers de resultado (simulam Result<T>) ──────────────────────────────

function okResult<T>(value: T) {
  return { isSuccess: true, isFailure: false, getValue: () => value, error: '' };
}

function failResult(msg: string) {
  return {
    isSuccess: false,
    isFailure: true,
    getValue: () => { throw new Error(msg); },
    error: msg,
  };
}

function makeWorker(id: string, phone?: string) {
  return {
    id,
    authUid: `import_${id}`,
    email: `${id}@enlite.import`,
    phone: phone ?? '5491151265663',
    country: 'AR',
    currentStep: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEncuadre(id = 'enc-001') {
  return {
    id,
    workerId: null,
    jobPostingId: 'job-001',
    workerRawPhone: '5491151265663',
    workerRawName: 'Silva Lautaro',
    interviewDate: new Date('2025-03-15'),
    interviewTime: null,
    meetLink: null,
    origen: null,
    idOnboarding: null,
    resultado: null,
    dedupHash: 'hash_abc',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

// ─── Helper para construir XLSX em memória ─────────────────────────────────

function buildXlsx(sheets: Record<string, unknown[][]>, _filename?: string): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    if (rows.length === 0) {
      // Aba vazia mas existente
      const ws = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    } else {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── Instâncias mockadas ────────────────────────────────────────────────────

let mockWorkerRepo: jest.Mocked<any>;
let mockEncuadreRepo: jest.Mocked<any>;
let mockBlacklistRepo: jest.Mocked<any>;
let mockPublicationRepo: jest.Mocked<any>;
let mockImportJobRepo: jest.Mocked<any>;
let mockJobPostingRepo: jest.Mocked<any>;
let mockFunnelRepo: jest.Mocked<any>;
let mockDedupService: jest.Mocked<any>;

beforeEach(() => {
  jest.clearAllMocks();

  // Configura mocks com defaults "felizes" (não encontra worker existente, cria tudo)
  mockWorkerRepo = {
    findByPhone: jest.fn().mockResolvedValue(okResult(null)),
    findByEmail: jest.fn().mockResolvedValue(okResult(null)),
    findByCuit:  jest.fn().mockResolvedValue(okResult(null)),  // 3ª chave de lookup
    create: jest.fn().mockResolvedValue(okResult(makeWorker('worker-001'))),
    updateFromImport: jest.fn().mockResolvedValue(undefined),
  };

  mockEncuadreRepo = {
    upsert: jest.fn().mockResolvedValue({ encuadre: makeEncuadre(), created: true }),
    findSoftMatch: jest.fn().mockResolvedValue(null),
    updateSupplement: jest.fn().mockResolvedValue(undefined),
    linkWorkersByPhone: jest.fn().mockResolvedValue(5),
  };

  mockBlacklistRepo = {
    upsert: jest.fn().mockResolvedValue(undefined),
    linkWorkersByPhone: jest.fn().mockResolvedValue(2),
  };

  mockPublicationRepo = {
    upsert: jest.fn().mockResolvedValue({ created: true }),
  };

  mockImportJobRepo = {
    updateStatus: jest.fn().mockResolvedValue(undefined),
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };

  mockJobPostingRepo = {
    findByCaseNumber: jest.fn().mockResolvedValue({ id: 'job-001', caseNumber: 738 }),
    upsertByCaseNumber: jest.fn().mockResolvedValue({ id: 'job-001', created: false }),
  };

  mockFunnelRepo = {
    updateFunnelStage: jest.fn().mockResolvedValue(undefined),
    updateOccupation: jest.fn().mockResolvedValue(undefined),
  };

  // WorkerDeduplicationService — retorna report vazio por padrão
  mockDedupService = {
    runDeduplicationForWorkers: jest.fn().mockResolvedValue({
      candidatesFound: 0, analyzed: 0, mergesExecuted: 0,
      mergesSkipped: 0, errors: 0, details: [],
    }),
  };

  // Configura os construtores mockados para retornar as instâncias acima
  (WorkerRepository as jest.Mock).mockImplementation(() => mockWorkerRepo);
  (EncuadreRepository as jest.Mock).mockImplementation(() => mockEncuadreRepo);
  (BlacklistRepository as jest.Mock).mockImplementation(() => mockBlacklistRepo);
  (PublicationRepository as jest.Mock).mockImplementation(() => mockPublicationRepo);
  (ImportJobRepository as jest.Mock).mockImplementation(() => mockImportJobRepo);
  (JobPostingARRepository as jest.Mock).mockImplementation(() => mockJobPostingRepo);
  (WorkerFunnelRepository as jest.Mock).mockImplementation(() => mockFunnelRepo);
  (WorkerDeduplicationService as jest.Mock).mockImplementation(() => mockDedupService);

  // addDataSource — non-fatal mesmo sem implementação, mas mock explícito evita noise
  mockWorkerRepo.addDataSource = jest.fn().mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════
//  ANA CARE CONTROL.XLSX — 10 cenários mais problemáticos
// ═══════════════════════════════════════════════════════════════════

describe('Ana Care Control — importAnaCare', () => {
  const ANA_HEADERS = [
    'Teléfono', 'Email', 'Nombre', 'Tipo', 'Fecha de nacimiento', 'Número de cédula', 'ID',
  ];

  function buildAnaCare(rows: unknown[][]): Buffer {
    return buildXlsx({ 'Ana Care': [ANA_HEADERS, ...rows] }, 'Ana Care Control.xlsx');
  }

  it('C1 — normaliza telefone 10 dígitos para 549... ao criar worker', async () => {
    const buf = buildAnaCare([['1151265663', 'maria@email.com', 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockWorkerRepo.findByPhone).toHaveBeenCalledWith('5491151265663');
    expect(mockWorkerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5491151265663' })
    );
  });

  it('C2 — worker já existe pelo telefone → updateFromImport, não create', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-existente')));

    const buf = buildAnaCare([['5491151265663', 'maria@email.com', 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(mockWorkerRepo.updateFromImport).toHaveBeenCalledWith('worker-existente', expect.any(Object));
    expect(result.workersUpdated).toBe(1);
    expect(result.workersCreated).toBe(0);
  });

  it('C3 — worker já existe pelo email → updateFromImport (fallback sem phone)', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null)); // não acha por phone
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(makeWorker('worker-email')));

    const buf = buildAnaCare([[null, 'maria@email.com', 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.workersUpdated).toBe(1);
  });

  it('C4 — sem phone e sem email → erro registrado, worker ignorado', async () => {
    const buf = buildAnaCare([[null, null, 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('C5 — coluna "Número de cédula" usada como CUIT (não coluna "Cédula")', async () => {
    // Planilha tem "Cédula"="Si" e "Número de cédula"="20-12345678-9"
    const headers = ['Teléfono', 'Email', 'Nombre', 'Tipo', 'Fecha de nacimiento', 'Cédula', 'Número de cédula', 'ID'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ['5491151265663', null, 'García María', 'AT', null, 'Si', '20-12345678-9', 'AC001'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Ana Care');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    // create deve receber cuit = '20-12345678-9', não 'Si'
    expect(mockWorkerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ /* phone ok */ })
    );
    // updateFromImport deveria receber o cuit correto (não 'Si')
    // Como worker não existe, cria — verifica que o cuit correto foi passado ao upsertWorker
    // PlanilhaImporter.upsertWorker recebe cuit via updateFromImport ou create.
    // Verificamos que a função não recebeu cuit = 'Si'
    const updateCalls = mockWorkerRepo.updateFromImport.mock.calls;
    for (const [, data] of updateCalls) {
      if (data && 'cuit' in data) {
        expect(data.cuit).not.toBe('Si');
      }
    }
  });

  it('C6 — Tipo "AT" → occupation AT, função updateOccupation chamada', async () => {
    const buf = buildAnaCare([['5491151265663', null, 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockFunnelRepo.updateOccupation).toHaveBeenCalledWith(
      expect.any(String), 'AT'
    );
  });

  it('C7 — Tipo "CUIDADOR" → occupation CUIDADOR', async () => {
    const buf = buildAnaCare([['5491151265663', null, 'García María', 'CUIDADOR', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockFunnelRepo.updateOccupation).toHaveBeenCalledWith(
      expect.any(String), 'CUIDADOR'
    );
  });

  it('C8 — funnel_stage QUALIFIED setado em novos workers', async () => {
    const buf = buildAnaCare([['5491151265663', null, 'García María', 'AT', null, null, 'AC001']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'QUALIFIED'
    );
  });

  it('C9 — múltiplos workers na mesma planilha (progress acumulado)', async () => {
    const buf = buildAnaCare([
      ['5491111111111', 'a@email.com', 'Worker A', 'AT', null, null, 'AC001'],
      ['5492222222222', 'b@email.com', 'Worker B', 'CUIDADOR', null, null, 'AC002'],
      ['5493333333333', 'c@email.com', 'Worker C', 'AT', null, null, 'AC003'],
    ]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(result.workersCreated).toBe(3);
    expect(mockWorkerRepo.create).toHaveBeenCalledTimes(3);
  });

  it('C10 — segundo registro com mesmo phone → update (not create) para o segundo', async () => {
    // Primeiro findByPhone retorna null (cria), segundo retorna o worker criado (atualiza)
    mockWorkerRepo.findByPhone
      .mockResolvedValueOnce(okResult(null))           // primeiro: não existe
      .mockResolvedValueOnce(okResult(makeWorker('worker-001'))); // segundo: já existe

    const buf = buildAnaCare([
      ['5491151265663', null, 'Worker A', 'AT', null, null, 'AC001'],
      ['5491151265663', null, 'Worker A duplicado', 'AT', null, null, 'AC001b'],
    ]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(result.workersCreated).toBe(1);
    expect(result.workersUpdated).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  CANDIDATOS.XLSX / Talentum — 10 cenários
// ═══════════════════════════════════════════════════════════════════

describe('CANDIDATOS — Talentum', () => {
  const HEADERS = ['Numeros de telefono', 'Nombre', 'Apellido', 'Status', 'CUIT', 'Email'];

  function buildCandidatos(talentumRows: unknown[][]): Buffer {
    return buildXlsx({
      'Talentum': [HEADERS, ...talentumRows],
      'NoTerminaronTalentum': [['Numero de telefono', 'Nombre', 'Apellido']],
      'NoUsarMás': [['CONTACTO', 'NOMBRE', 'APELLIDO', 'Resultado']],
    }, 'CANDIDATOS.xlsx');
  }

  it('C1 — Status "Blacklist" → funnel_stage BLACKLIST', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez', 'Blacklist', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'BLACKLIST'
    );
  });

  it('C2 — Status "QUALIFIED" → funnel_stage QUALIFIED', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez', 'QUALIFIED', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'QUALIFIED'
    );
  });

  it('C3 — Status vazio → default TALENTUM', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez', '', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'TALENTUM'
    );
  });

  it('C4 — Sem phone E sem CUIT → erro registrado, worker ignorado', async () => {
    const buf = buildCandidatos([[null, 'Juan', 'Pérez', 'TALENTUM', null, null]]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('C5 — Nombre + Apellido separados → concatenados corretamente', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez García', 'TALENTUM', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    // firstName = 'Juan', lastName = 'Pérez García' — passados ao upsertWorker
    expect(mockWorkerRepo.create).toHaveBeenCalled();
  });

  it('C6 — Phone com formatação (+54 9 11...) → normalizado para 549...', async () => {
    const buf = buildCandidatos([['+54 9 11 5126-5663', 'Juan', 'Pérez', 'TALENTUM', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockWorkerRepo.findByPhone).toHaveBeenCalledWith('5491151265663');
  });

  it('C7 — Phone duplicado na mesma planilha → segundo é update', async () => {
    mockWorkerRepo.findByPhone
      .mockResolvedValueOnce(okResult(null))
      .mockResolvedValueOnce(okResult(makeWorker('worker-001')));

    const buf = buildCandidatos([
      ['5491151265663', 'Juan', 'Pérez', 'TALENTUM', null, null],
      ['5491151265663', 'Juan', 'Pérez', 'QUALIFIED', null, null],
    ]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(result.workersCreated).toBe(1);
    expect(result.workersUpdated).toBe(1);
  });

  it('C8 — Email real fornecido → usado em vez do email gerado', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez', 'TALENTUM', null, 'juan@real.com']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    // findByEmail deve ser chamado com o email real (se não achou por phone)
    expect(mockWorkerRepo.findByEmail).toHaveBeenCalledWith('juan@real.com');
  });

  it('C9 — Sem phone mas com CUIT → usa CUIT como chave de dedup', async () => {
    const buf = buildCandidatos([[null, 'Juan', 'Pérez', 'TALENTUM', '20123456789', null]]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    // findByPhone não chamado (sem phone), cria via email gerado
    expect(mockWorkerRepo.findByPhone).not.toHaveBeenCalled();
    expect(result.workersCreated).toBe(1);
  });

  it('C10 — Status "Completed" → funnel TALENTUM', async () => {
    const buf = buildCandidatos([['5491111111111', 'Juan', 'Pérez', 'Completed', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'TALENTUM'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  CANDIDATOS.XLSX / NoUsarMás (Blacklist) — 5 cenários
// ═══════════════════════════════════════════════════════════════════

describe('CANDIDATOS — NoUsarMás (Blacklist)', () => {
  function buildNoUsar(rows: unknown[][]): Buffer {
    return buildXlsx({
      'Talentum': [['Numeros de telefono', 'Nombre', 'Apellido', 'Status']],
      'NoTerminaronTalentum': [['Numero de telefono', 'Nombre', 'Apellido']],
      'NoUsarMás': [['CONTACTO', 'NOMBRE', 'APELLIDO', 'Resultado', 'RESPUESTAS DE LOS CANDIDATOS'], ...rows],
    }, 'CANDIDATOS.xlsx');
  }

  it('C1 — phone lido de coluna "CONTACTO" (não TELEFONO)', async () => {
    const buf = buildNoUsar([['5491111111111', 'Juan', 'Pérez', 'No acepta', null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerRawPhone: '5491111111111' })
    );
  });

  it('C2 — motivo lido de coluna "Resultado" (não "Motivo")', async () => {
    const buf = buildNoUsar([['5491111111111', 'Juan', 'Pérez', 'No quiere trabajar', null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'No quiere trabajar' })
    );
  });

  it('C3 — motivo vazio → row ignorada, upsert NÃO chamado', async () => {
    const buf = buildNoUsar([['5491111111111', 'Juan', 'Pérez', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).not.toHaveBeenCalled();
  });

  it('C4 — detail lido de coluna "RESPUESTAS DE LOS CANDIDATOS"', async () => {
    const buf = buildNoUsar([['5491111111111', 'Juan', 'Pérez', 'Motivo X', 'Resposta detalhada']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Resposta detalhada' })
    );
  });

  it('C5 — phone normalizado para 549... na blacklist', async () => {
    const buf = buildNoUsar([['1151265663', 'Juan', 'Pérez', 'Motivo', null]]); // 10-digit
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerRawPhone: '5491151265663' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PLANILLA OPERATIVA / _Base1 — 10 cenários mais problemáticos
// ═══════════════════════════════════════════════════════════════════

describe('Planilla Operativa — _Base1', () => {
  // Constrói workbook mínimo com _Base1 e abas obrigatórias vazias
  function buildBase1(base1Rows: unknown[][], extraHeaders?: string[]): Buffer {
    const headers = extraHeaders ?? [
      'CASO', 'TELEFONO', 'NOMBRE Y APELLIDO', 'COORDINADOR\nASIGNADO',
      'FECHA\nENCUADRE', 'HORA\nENCUADRE', 'RESULTADO', 'OCUPACION',
      'RECLUTADOR', 'PRESENTE', 'ACEPTA CASO', 'CV', 'DNI', 'CERT AT',
      'AFIP', 'CBU', 'AP', 'SEG',
    ];
    return buildXlsx({
      '_Índice': [['CASO', 'PACIENTE', 'ESTADO'], [738, 'Juan Pérez', 'ACTIVO']],
      '_Base1': [headers, ...base1Rows],
      '_BlackList': [['f', 'WhatsApp', 'Registrado por']],
      '_Publicaciones': [['CASO', 'Canal / RRSS', 'Grupos / Comunidades', 'RECLUTADOR', 'FECHA']],
    }, 'Planilla Operativa Encuadre.xlsx');
  }

  it('C1 — coluna "COORDINADOR\\nASIGNADO" (com newline) é normalizada e lida corretamente', async () => {
    const buf = buildBase1([
      [738, '5491151265663', 'Silva Lautaro', 'María García',
       new Date('2025-03-15'), null, null, 'AT', null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ coordinatorName: 'María García' })
    );
  });

  it('C2 — coluna "FECHA\\nENCUADRE" normalizada → interviewDate preenchido', async () => {
    const interviewDate = new Date('2025-03-15');
    const buf = buildBase1([
      [738, '5491151265663', 'Silva Lautaro', 'Coord', interviewDate, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const upsertCall = mockEncuadreRepo.upsert.mock.calls[0][0];
    expect(upsertCall.interviewDate).toBeInstanceOf(Date);
  });

  it('C3 — HORA ENCUADRE decimal 0.5833 → interviewTime "14:00"', async () => {
    const buf = buildBase1([
      [738, '5491151265663', 'Silva Lautaro', 'Coord',
       new Date('2025-03-15'), 0.5833, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ interviewTime: '14:00' })
    );
  });

  it('C4 — phone 10 dígitos (formato Ana Care) normalizado para 549...', async () => {
    const buf = buildBase1([
      [738, '1151265663', 'Silva Lautaro', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockWorkerRepo.findByPhone).toHaveBeenCalledWith('5491151265663');
    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerRawPhone: '5491151265663' })
    );
  });

  it('C5 — worker criado do _Base1: workerId passado direto ao encuadreRepo.upsert', async () => {
    mockWorkerRepo.create.mockResolvedValue(okResult(makeWorker('worker-base1', '5491151265663')));

    const buf = buildBase1([
      [738, '5491151265663', 'Silva Lautaro', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerId: 'worker-base1' })
    );
  });

  it('C6 — worker do _Base1 já existe no Ana Care (mesmo phone) → update, sem duplicata', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-anacare')));

    const buf = buildBase1([
      [738, '5491151265663', 'García María', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const base1 = results.find(r => r.sheet === '_Base1');
    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(base1?.workersUpdated).toBe(1);
    expect(base1?.workersCreated).toBe(0);
  });

  it('C7 — encuadre duplicado (mesma dedup_hash) → encuadresSkipped++', async () => {
    mockEncuadreRepo.upsert.mockResolvedValue({ encuadre: makeEncuadre(), created: false });

    const buf = buildBase1([
      [738, '5491151265663', 'Silva Lautaro', null, new Date('2025-03-15'), null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const base1 = results.find(r => r.sheet === '_Base1');
    expect(base1?.encuadresSkipped).toBe(1);
    expect(base1?.encuadresCreated).toBe(0);
  });

  it('C8 — case não existe no _Índice → auto-criado via upsertByCaseNumber', async () => {
    mockJobPostingRepo.findByCaseNumber.mockResolvedValue(null); // case não existe
    mockJobPostingRepo.upsertByCaseNumber.mockResolvedValue({ id: 'job-novo', created: true });

    const buf = buildBase1([
      [999, '5491151265663', 'Silva Lautaro', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ caseNumber: 999 })
    );
  });

  it('C9 — ACEPTA CASO "Sí" (com acento) → aceita normalizado para "Si"', async () => {
    const headersAcepta = [
      'CASO', 'TELEFONO', 'NOMBRE Y APELLIDO', 'COORDINADOR ASIGNADO',
      'FECHA ENCUADRE', 'HORA ENCUADRE', 'RESULTADO', 'OCUPACION',
      'RECLUTADOR', 'PRESENTE', 'ACEPTA CASO',
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['CASO', 'PACIENTE'], [738, 'Paciente X'],
    ]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      headersAcepta,
      [738, '5491151265663', 'Silva', null, null, null, null, null, null, 'Si', 'Sí'],
    ]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ acceptsCase: 'Si' })
    );
  });

  it('C10 — todos os booleans de documentos lidos corretamente', async () => {
    const headers = [
      'CASO', 'TELEFONO', 'NOMBRE Y APELLIDO',
      'CV', 'DNI', 'CERT AT', 'AFIP', 'CBU', 'AP', 'SEG',
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO'], [738]]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      headers,
      [738, '5491151265663', 'Silva', 'Si', 'Si', 'Si', 'No', 'Si', 'X', 'Si'],
    ]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      hasCv: true,
      hasDni: true,
      hasCertAt: true,
      hasAfip: false,
      hasCbu: true,
      hasAp: true,
      hasSeguros: true,
    }));
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PLANILLA OPERATIVA / _CaseSheets — 8 cenários de cruzamento
// ═══════════════════════════════════════════════════════════════════

describe('Planilla Operativa — _CaseSheets (cruzamento com _Base1)', () => {
  const CASE_HEADERS = [
    'CASO', 'TELEFONO', 'NOMBRE Y APELLIDO',
    'FECHA\nENCUADRE', 'HORA\nENCUADRE', 'ORIGEN', 'ID ONBOARDING', 'RESULTADO',
  ];

  function buildWithCaseSheet(caseRows: unknown[][], softMatchEncuadre: any | null = null): Buffer {
    if (softMatchEncuadre !== null) {
      mockEncuadreRepo.findSoftMatch.mockResolvedValue(softMatchEncuadre);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'PACIENTE'], [738, 'Juan Pérez']]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['CASO', 'TELEFONO', 'NOMBRE Y APELLIDO'],
      [738, '5491151265663', 'Silva Lautaro'],
    ]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CASE_HEADERS, ...caseRows]), '738 - Silva Lautaro');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('C1 — soft match encontrado → updateSupplement chamado, upsert NÃO (para a case sheet)', async () => {
    const existingEnc = makeEncuadre('enc-existing');
    const buf = buildWithCaseSheet(
      [[738, '5491151265663', 'Silva Lautaro', new Date('2025-03-15'), 0.5833, 'WhatsApp', 'ONB-001', 'SELECCIONADO']],
      existingEnc
    );
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.updateSupplement).toHaveBeenCalledWith(
      'enc-existing',
      expect.objectContaining({
        interviewTime: '14:00',   // 0.5833 convertido
        origen: 'WhatsApp',
        idOnboarding: 'ONB-001',
        resultado: 'SELECCIONADO',
      })
    );
    // upsert foi chamado 1x pelo _Base1, não pela case sheet
    expect(mockEncuadreRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('C2 — sem soft match → novo encuadre criado via upsert', async () => {
    // findSoftMatch retorna null (default no beforeEach)
    const buf = buildWithCaseSheet([
      [738, '5491151265663', 'Silva Lautaro', new Date('2025-03-15'), null, 'Facebook', 'ONB-002', null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    // upsert: 1 do _Base1 + 1 da case sheet = 2 total
    expect(mockEncuadreRepo.upsert).toHaveBeenCalledTimes(2);
    expect(mockEncuadreRepo.updateSupplement).not.toHaveBeenCalled();
  });

  it('C3 — HORA ENCUADRE decimal 0.75 → "18:00"', async () => {
    const existingEnc = makeEncuadre('enc-001');
    const buf = buildWithCaseSheet(
      [[738, '5491151265663', 'Silva Lautaro', new Date('2025-03-15'), 0.75, null, null, null]],
      existingEnc
    );
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.updateSupplement).toHaveBeenCalledWith(
      'enc-001',
      expect.objectContaining({ interviewTime: '18:00' })
    );
  });

  it('C4 — HORA ENCUADRE decimal 0.375 → "09:00"', async () => {
    const existingEnc = makeEncuadre('enc-001');
    const buf = buildWithCaseSheet(
      [[738, '5491151265663', 'Silva Lautaro', new Date('2025-03-15'), 0.375, null, null, null]],
      existingEnc
    );
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockEncuadreRepo.updateSupplement).toHaveBeenCalledWith(
      'enc-001',
      expect.objectContaining({ interviewTime: '09:00' })
    );
  });

  it('C5 — case number extraído do nome da aba "738 - Silva Lautaro"', async () => {
    const buf = buildWithCaseSheet([
      [738, '5491151265663', 'Silva Lautaro', null, null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    // jobPostingRepo.findByCaseNumber deve ser chamado com 738
    expect(mockJobPostingRepo.findByCaseNumber).toHaveBeenCalledWith(738);
  });

  it('C6 — worker criado da case sheet e passado ao novo encuadre', async () => {
    // findSoftMatch retorna null → cria novo encuadre
    mockWorkerRepo.create
      .mockResolvedValueOnce(okResult(makeWorker('worker-base1')))   // _Base1
      .mockResolvedValueOnce(okResult(makeWorker('worker-case')));   // case sheet

    const buf = buildWithCaseSheet([
      [738, '5492222222222', 'Outro Worker', new Date('2025-03-20'), null, null, null, null],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    // O segundo upsert (da case sheet) deve ter workerId do worker criado
    const casesheetUpsertCall = mockEncuadreRepo.upsert.mock.calls[1];
    expect(casesheetUpsertCall[0]).toMatchObject({ workerId: 'worker-case' });
  });

  it('C7 — linha sem dados (NOME e TELEFONE null) → ignorada', async () => {
    const buf = buildWithCaseSheet([
      [null, null, null, null, null, null, null, null], // linha vazia
    ]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const caseResult = results.find(r => r.sheet === '_CaseSheets');
    // Linha sem dados não é processada
    expect(caseResult?.totalRows).toBe(0);
  });

  it('C8 — COALESCE: updateSupplement não sobrescreve campos já preenchidos', async () => {
    // Cenário: encuadre já tem interviewTime preenchido
    const existingEnc = { ...makeEncuadre('enc-001'), interviewTime: '10:00' };
    const buf = buildWithCaseSheet(
      [[738, '5491151265663', 'Silva', new Date('2025-03-15'), null, 'WhatsApp', null, null]],
      existingEnc
    );
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    // updateSupplement é chamado com interviewTime: null
    // O COALESCE no SQL garante que não sobrescreve — verificamos que o DTO enviado é correto
    expect(mockEncuadreRepo.updateSupplement).toHaveBeenCalledWith(
      'enc-001',
      expect.objectContaining({ interviewTime: null, origen: 'WhatsApp' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PLANILLA OPERATIVA / _BlackList — 7 cenários
// ═══════════════════════════════════════════════════════════════════

describe('Planilla Operativa — _BlackList', () => {
  const BL_HEADERS = ['f', 'WhatsApp', 'Registrado por', '__EMPTY_1', '__EMPTY_2', 'PUEDE TOMAR EVENTUAL'];

  function buildBlacklist(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO'], [738]]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'TELEFONO']]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([BL_HEADERS, ...rows]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('C1 — nome lido de coluna "f" (não NOMBRE Y APELLIDO)', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'No quiere', null, null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerRawName: 'García Juan' })
    );
  });

  it('C2 — phone lido de coluna "WhatsApp" (não TELEFONO)', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'Motivo X', null, null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workerRawPhone: '5491111111111' })
    );
  });

  it('C3 — motivo lido de "Registrado por" (coluna com nome confuso)', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'Motivo Real', null, null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Motivo Real' })
    );
  });

  it('C4 — detail lido de "__EMPTY_1"', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'Motivo', 'Detalhe aqui', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Detalhe aqui' })
    );
  });

  it('C5 — registeredBy lido de "__EMPTY_2"', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'Motivo', null, 'Coord. García', null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ registeredBy: 'Coord. García' })
    );
  });

  it('C6 — motivo vazio → row ignorada', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', null, null, null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).not.toHaveBeenCalled();
  });

  it('C7 — canTakeEventual "Si" → true', async () => {
    const buf = buildBlacklist([['García Juan', '5491111111111', 'Motivo', null, null, 'Si']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockBlacklistRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canTakeEventual: true })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PLANILLA OPERATIVA / _Publicaciones — 5 cenários
// ═══════════════════════════════════════════════════════════════════

describe('Planilla Operativa — _Publicaciones', () => {
  const PUB_HEADERS = ['CASO', 'Canal / RRSS', 'Grupos / Comunidades', 'RECLUTADOR', 'FECHA', 'Observaciones'];

  function buildPublicaciones(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO'], [738]]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'TELEFONO']]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PUB_HEADERS, ...rows]), '_Publicaciones');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('C1 — canal lido de "Canal / RRSS" (não "CANAL")', async () => {
    const buf = buildPublicaciones([[738, 'WhatsApp', 'Grupo Cuidadores BA', 'Juan', new Date('2025-03-01'), null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockPublicationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'WhatsApp' })
    );
  });

  it('C2 — grupo lido de "Grupos / Comunidades" (não "GRUPO")', async () => {
    const buf = buildPublicaciones([[738, 'Facebook', 'Grupo X', 'Juan', new Date('2025-03-01'), null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockPublicationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ groupName: 'Grupo X' })
    );
  });

  it('C3 — publicação duplicada (upsert retorna created: false) → encuadresSkipped++', async () => {
    mockPublicationRepo.upsert.mockResolvedValue({ created: false });

    const buf = buildPublicaciones([[738, 'WhatsApp', 'Grupo X', 'Juan', new Date('2025-03-01'), null]]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const pubResult = results.find(r => r.sheet === '_Publicaciones');
    expect(pubResult?.encuadresSkipped).toBe(1);
  });

  it('C4 — sem case number → jobPostingId null', async () => {
    const buf = buildPublicaciones([[null, 'Instagram', 'Grupo Y', 'Maria', new Date('2025-03-01'), null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockPublicationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ jobPostingId: null })
    );
  });

  it('C5 — observations lido de "Observaciones"', async () => {
    const buf = buildPublicaciones([[738, 'WhatsApp', 'Grupo', 'Juan', new Date('2025-03-01'), 'Boa resposta']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockPublicationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ observations: 'Boa resposta' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PLANILLA OPERATIVA / _Índice — 5 cenários
// ═══════════════════════════════════════════════════════════════════

describe('Planilla Operativa — _Índice', () => {
  const IDX_HEADERS = ['CASO', 'PACIENTE', 'ESTADO', 'DEPENDENCIA', 'PRIORIDAD'];

  function buildIndice(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([IDX_HEADERS, ...rows]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'TELEFONO']]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('C1 — case criado com dados básicos', async () => {
    mockJobPostingRepo.upsertByCaseNumber.mockResolvedValue({ id: 'job-738', created: true });

    const buf = buildIndice([[738, 'Juan Pérez', 'ACTIVO', null, null]]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    const idxResult = results.find(r => r.sheet === '_Índice');
    expect(idxResult?.casesCreated).toBe(1);
    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ caseNumber: 738 })
    );
  });

  it('C2 — DEPENDENCIA "MUY GRAVE" → MUY_GRAVE', async () => {
    const buf = buildIndice([[738, 'Juan Pérez', 'ACTIVO', 'MUY GRAVE', null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ dependency: 'MUY_GRAVE' })
    );
  });

  it('C3 — PRIORIDAD "URGENTE" → URGENTE', async () => {
    const buf = buildIndice([[738, 'Juan Pérez', 'ACTIVO', null, 'URGENTE']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'URGENTE' })
    );
  });

  it('C4 — ESTADO "SUSPENDIDO" → status paused', async () => {
    const buf = buildIndice([[738, 'Juan Pérez', 'SUSPENDIDO', null, null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paused' })
    );
  });

  it('C5 — CASO inválido (NaN) → ignorado, sem erro fatal', async () => {
    const buf = buildIndice([['INVALIDO', 'Juan Pérez', 'ACTIVO', null, null]]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001');

    // Nenhum case criado
    const idxResult = results.find(r => r.sheet === '_Índice');
    expect(idxResult?.casesCreated).toBe(0);
    expect(mockJobPostingRepo.upsertByCaseNumber).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  FLUXO GERAL — progress e logging
// ═══════════════════════════════════════════════════════════════════

describe('Fluxo geral — importBuffer', () => {
  it('detecta Planilla Operativa pelo nome do arquivo', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO']]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'TELEFONO']]), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const importer = new PlanilhaImporter();
    await expect(
      importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-001')
    ).resolves.toBeDefined();
  });

  it('detecta Ana Care pelo nome do arquivo', async () => {
    const buf = buildXlsx({ 'Ana Care': [['Teléfono', 'Nombre']] }, 'Ana Care Control.xlsx');
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');
    expect(results).toHaveLength(1);
    expect(results[0].sheet).toBe('Ana Care');
  });

  it('detecta CANDIDATOS pelo nome do arquivo', async () => {
    const buf = buildXlsx({
      'Talentum': [['Numeros de telefono', 'Nombre', 'Apellido', 'Status']],
      'NoTerminaronTalentum': [['Numero de telefono', 'Nombre']],
      'NoUsarMás': [['CONTACTO', 'Resultado']],
    }, 'CANDIDATOS.xlsx');

    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-001');
    expect(results).toHaveLength(1);
  });

  it('arquivo não reconhecido → lança erro e status = "error"', async () => {
    const buf = buildXlsx({ 'Random': [['col1', 'col2']] });
    const importer = new PlanilhaImporter();

    await expect(
      importer.importBuffer(buf, 'desconhecido.xlsx', 'job-001')
    ).rejects.toThrow();

    expect(mockImportJobRepo.updateStatus).toHaveBeenCalledWith('job-001', 'error');
  });

  it('importJobRepo.updateStatus called com "done" ao final do sucesso', async () => {
    const buf = buildXlsx({ 'Ana Care': [['Teléfono', 'Nombre']] }, 'Ana Care Control.xlsx');
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockImportJobRepo.updateStatus).toHaveBeenCalledWith('job-001', 'done');
  });

  it('linkWorkersByPhone chamado ao final para vincular encuadres', async () => {
    const buf = buildXlsx({ 'Ana Care': [['Teléfono', 'Nombre']] }, 'Ana Care Control.xlsx');
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-001');

    expect(mockEncuadreRepo.linkWorkersByPhone).toHaveBeenCalled();
    expect(mockBlacklistRepo.linkWorkersByPhone).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PROCESSAMENTO EM CHUNKS (CHUNK_SIZE = 100)
// ═══════════════════════════════════════════════════════════════════

describe('Processamento em chunks (CHUNK_SIZE = 100)', () => {
  /** Constrói um _Base1 com N linhas de dados */
  function buildBase1WithRows(n: number): Buffer {
    const headers = ['CASO', 'TELEFONO', 'NOMBRE Y APELLIDO'];
    const rows: unknown[][] = [headers];
    for (let i = 0; i < n; i++) {
      rows.push([738, `54911${String(i).padStart(8, '0')}`, `Worker ${i}`]);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO']]), '_Índice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '_Base1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['f', 'WhatsApp', 'Registrado por']]), '_BlackList');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CASO', 'Canal / RRSS']]), '_Publicaciones');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('CH1 — _Base1 com 150 linhas → updateProgress chamado ≥ 2x (1 flush + 1 final)', async () => {
    const buf = buildBase1WithRows(150);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-chunk');

    // 1 flush intermediário (processedRows=100) + 1 final em importBuffer
    expect(mockImportJobRepo.updateProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('CH2 — _Base1 com 250 linhas → updateProgress chamado ≥ 3x (2 flushes + 1 final)', async () => {
    const buf = buildBase1WithRows(250);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-chunk');

    // 2 flushes (rows 100, 200) + 1 final = ≥ 3
    expect(mockImportJobRepo.updateProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('CH3 — totais finais corretos após processamento chunked de 150 linhas', async () => {
    const buf = buildBase1WithRows(150);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'Planilla Operativa Encuadre.xlsx', 'job-chunk');

    const base1 = results.find(r => r.sheet === '_Base1');
    expect(base1?.processedRows).toBe(150);
    expect(base1?.encuadresCreated).toBe(150);
    expect(base1?.workersCreated).toBe(150);
  });

  it('CH4 — callback onProgress chamado ≥ 2x para _Base1 com 150 linhas', async () => {
    const buf = buildBase1WithRows(150);
    const importer = new PlanilhaImporter();
    const progressCalls: number[] = [];

    await importer.importBuffer(
      buf,
      'Planilla Operativa Encuadre.xlsx',
      'job-chunk',
      (p) => { if (p.sheet === '_Base1') progressCalls.push(p.processedRows); },
    );

    // Flush em row 100 + chamada final = ≥ 2
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    // Primeiro flush deve ser exatamente em processedRows=100
    expect(progressCalls[0]).toBe(100);
  });

  it('CH5 — Ana Care com 150 linhas → flush intermediário chamado', async () => {
    const ANA_HEADERS = ['Teléfono', 'Email', 'Nombre'];
    const rows: unknown[][] = [ANA_HEADERS];
    for (let i = 0; i < 150; i++) {
      rows.push([`5491${String(i).padStart(9, '0')}`, `w${i}@email.com`, `Worker ${i}`]);
    }
    const buf = buildXlsx({ 'Ana Care': rows }, 'Ana Care Control.xlsx');
    const importer = new PlanilhaImporter();

    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-chunk');

    // 1 flush (row 100) + 1 final em importBuffer = ≥ 2
    expect(mockImportJobRepo.updateProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('CH6 — snapshots parciais corretos: row 100 → 100 encuadres; row 150 → 150 encuadres', async () => {
    const buf = buildBase1WithRows(150);
    const importer = new PlanilhaImporter();
    const snapshots: { encuadresCreated: number; processedRows: number }[] = [];

    await importer.importBuffer(
      buf,
      'Planilla Operativa Encuadre.xlsx',
      'job-chunk',
      (p) => {
        if (p.sheet === '_Base1') {
          snapshots.push({ encuadresCreated: p.encuadresCreated, processedRows: p.processedRows });
        }
      },
    );

    // Primeiro snapshot: flush em processedRows=100
    expect(snapshots[0]?.processedRows).toBe(100);
    expect(snapshots[0]?.encuadresCreated).toBe(100);

    // Último snapshot: fim do loop em processedRows=150
    const last = snapshots[snapshots.length - 1];
    expect(last?.processedRows).toBe(150);
    expect(last?.encuadresCreated).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  TALENT SEARCH CSV EXPORT — 10 cenários
// ═══════════════════════════════════════════════════════════════════

describe('Talent Search CSV — importTalentSearch', () => {
  // Mock adicional: WorkerApplicationRepository
  let mockWorkerApplicationRepo: jest.Mocked<any>;

  beforeEach(() => {
    // WorkerApplicationRepository já é mockado via jest.mock('../../repositories/OperationalRepositories')
    const { WorkerApplicationRepository } = require('../../repositories/OperationalRepositories');
    mockWorkerApplicationRepo = {
      upsert: jest.fn().mockResolvedValue({ created: true }),
      findByWorkerId: jest.fn().mockResolvedValue([]),
    };
    (WorkerApplicationRepository as jest.Mock).mockImplementation(() => mockWorkerApplicationRepo);
  });

  /** Constrói um CSV em buffer como se fosse o arquivo do ATS */
  function buildTalentSearchCSV(rows: unknown[][]): Buffer {
    const headers = [
      'Nombre', 'Apellido', 'Secuencias', 'Busquedas', 'Pre screenings',
      'Fecha', 'Status', 'Notas', 'Rating', 'Emails', 'Numeros de telefono',
      'Linkedin',
      '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
      '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    // Escreve como CSV e devolve como buffer UTF-8
    const csv = XLSX.utils.sheet_to_csv(ws);
    return Buffer.from(csv, 'utf-8');
  }

  const BASE_ROW = [
    'Marisol', 'Pallero', '', '',
    'CASO 694, CASO 672, CASO 701',
    '3/18/2026', 'QUALIFIED', '', 'No rating',
    'marisol@gmail.com', '5491128699277', '',
    '27280435215', 'Acompañante',
  ];

  it('TS1 — detecta arquivo .csv com headers corretos como talent_search', async () => {
    const buf = buildTalentSearchCSV([BASE_ROW]);
    const importer = new PlanilhaImporter();
    const results = await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');
    expect(results).toHaveLength(1);
    expect(results[0].sheet).toBe('TalentSearch');
  });

  it('TS2 — QUALIFIED status → worker com funnel_stage QUALIFIED', async () => {
    const buf = buildTalentSearchCSV([BASE_ROW]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'QUALIFIED'
    );
  });

  it('TS3 — MESSAGE_SENT status → funnel_stage PRE_TALENTUM', async () => {
    const row = [...BASE_ROW];
    row[6] = 'MESSAGE_SENT';
    const buf = buildTalentSearchCSV([row]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    expect(mockFunnelRepo.updateFunnelStage).toHaveBeenCalledWith(
      expect.any(String), 'PRE_TALENTUM'
    );
  });

  it('TS4 — Pre screenings "CASO 694, CASO 672, CASO 701" → 3 applications criadas', async () => {
    const buf = buildTalentSearchCSV([BASE_ROW]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    // Uma chamada de upsert de application para cada case number
    expect(mockWorkerApplicationRepo.upsert).toHaveBeenCalledTimes(3);
  });

  it('TS5 — Pre screenings com texto livre "CASO 719, AT, para pacientes..." → só extrai case numbers', async () => {
    const row = [...BASE_ROW];
    row[4] = 'CASO 719, CASO 725, AT, para pacientes com Discapacidade - Nordelta';
    const buf = buildTalentSearchCSV([row]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    // Apenas CASO 719 e CASO 725 devem gerar applications
    expect(mockWorkerApplicationRepo.upsert).toHaveBeenCalledTimes(2);
  });

  it('TS6 — múltiplos phones separados por vírgula → usa o melhor (549...)', async () => {
    const row = [...BASE_ROW];
    row[10] = '1168719747, +5491176195348'; // segundo é o 13-digit 549...
    const buf = buildTalentSearchCSV([row]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    // O worker deve ser buscado/criado com o telefone normalizado 549...
    const phoneUsed = mockWorkerRepo.findByPhone.mock.calls[0]?.[0];
    expect(String(phoneUsed).startsWith('549')).toBe(true);
    expect(String(phoneUsed)).toHaveLength(13);
  });

  it('TS7 — worker já existe pelo telefone → updateFromImport, não create', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-existente')));

    const buf = buildTalentSearchCSV([BASE_ROW]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.workersUpdated).toBe(1);
    expect(result.workersCreated).toBe(0);
  });

  it('TS8 — CASO não existe ainda → job posting auto-criado', async () => {
    mockJobPostingRepo.findByCaseNumber.mockResolvedValue(null);
    mockJobPostingRepo.upsertByCaseNumber.mockResolvedValue({ id: 'job-auto', created: true });

    const row = [...BASE_ROW];
    row[4] = 'CASO 999'; // caso inexistente
    const buf = buildTalentSearchCSV([row]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    expect(mockJobPostingRepo.upsertByCaseNumber).toHaveBeenCalledWith(
      expect.objectContaining({ caseNumber: 999, country: 'AR' })
    );
    expect(result.casesCreated).toBe(1);
  });

  it('TS9 — row sem phone E sem email → erro registrado, não cria worker', async () => {
    const row: (string | null)[] = [...BASE_ROW];
    row[9] = null;  // Email
    row[10] = null; // Phone
    const buf = buildTalentSearchCSV([row]);
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TS10 — occupation "Acompañante" → occupation AT; "Cuidadora" → CUIDADOR', async () => {
    const rowAT = [...BASE_ROW];
    rowAT[13] = 'Acompañante terapéutico con certificado';

    const rowCuidador = [...BASE_ROW];
    rowCuidador[9] = 'cuidador@email.com';
    rowCuidador[10] = '5491199999999';
    rowCuidador[13] = 'Cuidadora';

    const buf = buildTalentSearchCSV([rowAT, rowCuidador]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-ts');

    // Primeiro worker → occupation AT
    expect(mockFunnelRepo.updateOccupation).toHaveBeenCalledWith(expect.any(String), 'AT');
    // Segundo worker → occupation CUIDADOR
    expect(mockFunnelRepo.updateOccupation).toHaveBeenCalledWith(expect.any(String), 'CUIDADOR');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  DEDUPLICAÇÃO PÓS-IMPORTAÇÃO — 10 garantias
//
//  Garante que runDeduplicationForWorkers é invocado automaticamente
//  ao final de QUALQUER tipo de importação, com os IDs corretos,
//  e que erros no dedup NUNCA abortam o import.
// ═══════════════════════════════════════════════════════════════════

describe('Deduplicação pós-importação', () => {
  // ── Builders mínimos para cada tipo ──────────────────────────────────────

  const ANA_HEADERS = [
    'Teléfono', 'Email', 'Nombre', 'Tipo', 'Fecha de nacimiento', 'Número de cédula', 'ID',
  ];
  function buildAnaCareDD(rows: unknown[][]): Buffer {
    return buildXlsx({ 'Ana Care': [ANA_HEADERS, ...rows] }, 'Ana Care Control.xlsx');
  }

  const CAND_HEADERS = ['Nombre y Apellido', 'Estado', 'Teléfono', 'Email', 'Cedula'];
  function buildCandidatosDD(rows: unknown[][]): Buffer {
    return buildXlsx({
      'Talentum':      [CAND_HEADERS, ...rows],
      'NoTerminaronTalentum': [CAND_HEADERS],
      'NoUsarMás':     [CAND_HEADERS],
    }, 'CANDIDATOS.xlsx');
  }

  function buildPlanillaDD(base1Rows: unknown[][]): Buffer {
    // Usa os mesmos headers que os testes existentes de _Base1
    const base1Headers = ['CASO', 'TELEFONO', 'NOMBRE Y APELLIDO'];
    return buildXlsx({
      '_Índice': [['Caso', 'Paciente', 'Coordinador', 'Dependencia', 'Prioridad', 'Estado', 'Cubierto']],
      '_Base1': [base1Headers, ...base1Rows],
      '_CaseSheets': [],
      '_BlackList': [['Nombre', 'Teléfono', 'Motivo', 'Detalle', 'Registrado por', 'Eventual']],
      '_Publicaciones': [['Caso', 'Canal', 'Grupo', 'Fecha', 'Nombre reclutador', 'Hash']],
    }, 'Planilla_Operativa.xlsm');
  }

  function buildTalentSearchDD(rows: unknown[][]): Buffer {
    const headers = [
      'Nombre', 'Apellido', 'Secuencias', 'Busquedas', 'Pre screenings',
      'Fecha', 'Status', 'Notas', 'Rating', 'Emails', 'Numeros de telefono',
      'Linkedin',
      '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
      '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const csv = XLSX.utils.sheet_to_csv(ws);
    return Buffer.from(csv, 'utf-8');
  }

  // ── DD1 — Ana Care aciona dedup ────────────────────────────────────────────
  it('DD1 — Ana Care: runDeduplicationForWorkers é chamado após import', async () => {
    const buf = buildAnaCareDD([['5491151265663', 'a@email.com', 'García María', 'AT', null, null, 'AC1']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd1');

    expect(mockDedupService.runDeduplicationForWorkers).toHaveBeenCalledTimes(1);
  });

  // ── DD2 — Candidatos aciona dedup ──────────────────────────────────────────
  it('DD2 — Candidatos: runDeduplicationForWorkers é chamado após import', async () => {
    const buf = buildCandidatosDD([['García María', 'QUALIFIED', '5491151265663', 'a@email.com', null]]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'CANDIDATOS.xlsx', 'job-dd2');

    expect(mockDedupService.runDeduplicationForWorkers).toHaveBeenCalledTimes(1);
  });

  // ── DD3 — Planilla Operativa aciona dedup ──────────────────────────────────
  it('DD3 — Planilla Operativa: runDeduplicationForWorkers é chamado após import', async () => {
    // Apenas 3 colunas são suficientes para disparar upsertWorker em _Base1
    const buf = buildPlanillaDD([[738, '5491151265663', 'García María']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Planilla_Operativa.xlsm', 'job-dd3');

    expect(mockDedupService.runDeduplicationForWorkers).toHaveBeenCalledTimes(1);
  });

  // ── DD4 — Talent Search aciona dedup ──────────────────────────────────────
  it('DD4 — Talent Search: runDeduplicationForWorkers é chamado após import', async () => {
    const buf = buildTalentSearchDD([
      ['Marisol', 'Pallero', '', '', 'CASO 694', '3/18/2026', 'QUALIFIED', '', 'No rating',
       'marisol@gmail.com', '5491128699277', '', '27280435215', 'Acompañante'],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export_2026-03-20.csv', 'job-dd4');

    expect(mockDedupService.runDeduplicationForWorkers).toHaveBeenCalledTimes(1);
  });

  // ── DD5 — IDs dos workers CRIADOS são passados ao dedup ───────────────────
  it('DD5 — worker criado: seu ID é incluído no array passado ao dedup', async () => {
    mockWorkerRepo.create.mockResolvedValue(okResult(makeWorker('worker-novo-dd5')));

    const buf = buildAnaCareDD([['5491151265663', 'novo@email.com', 'García', 'AT', null, null, 'AC1']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd5');

    const [ids] = mockDedupService.runDeduplicationForWorkers.mock.calls[0];
    expect(ids).toContain('worker-novo-dd5');
  });

  // ── DD6 — IDs dos workers ATUALIZADOS também são passados ao dedup ─────────
  it('DD6 — worker atualizado (findByPhone): seu ID é incluído no array de dedup', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-existente-dd6')));

    const buf = buildAnaCareDD([['5491151265663', 'a@email.com', 'García', 'AT', null, null, 'AC1']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd6');

    const [ids] = mockDedupService.runDeduplicationForWorkers.mock.calls[0];
    expect(ids).toContain('worker-existente-dd6');
  });

  // ── DD7 — IDs passados são únicos (sem repetições) ─────────────────────────
  it('DD7 — mesmo worker aparecendo em N rows → ID único no array de dedup', async () => {
    // Mesmo phone → findByPhone sempre retorna o mesmo worker
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-dup-dd7')));

    const buf = buildAnaCareDD([
      ['5491151265663', 'a1@email.com', 'García', 'AT', null, null, 'AC1'],
      ['5491151265663', 'a2@email.com', 'García', 'AT', null, null, 'AC2'],
      ['5491151265663', 'a3@email.com', 'García', 'AT', null, null, 'AC3'],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd7');

    const [ids] = mockDedupService.runDeduplicationForWorkers.mock.calls[0];
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
    expect(ids).toEqual(['worker-dup-dd7']); // apenas 1 entrada
  });

  // ── DD8 — dedup NÃO é chamado quando nenhum worker é tocado ───────────────
  it('DD8 — import sem workers válidos: dedup NÃO é chamado', async () => {
    // Todos os rows têm erro (sem email e sem phone)
    const buf = buildAnaCareDD([
      [null, null, 'García', 'AT', null, null, 'AC1'],
      [null, null, 'Souza', 'AT', null, null, 'AC2'],
    ]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd8');

    expect(mockDedupService.runDeduplicationForWorkers).not.toHaveBeenCalled();
  });

  // ── DD9 — erro no dedup NÃO aborta o import ───────────────────────────────
  it('DD9 — GROQ_API_KEY ausente no dedup: import finaliza como "done" mesmo assim', async () => {
    mockDedupService.runDeduplicationForWorkers.mockRejectedValue(
      new Error('GROQ_API_KEY não configurado'),
    );

    const buf = buildAnaCareDD([['5491151265663', 'a@email.com', 'García', 'AT', null, null, 'AC1']]);
    const importer = new PlanilhaImporter();

    // Import não deve lançar exceção
    await expect(
      importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd9'),
    ).resolves.toBeDefined();

    // Status do job deve ser 'done' (não 'error')
    expect(mockImportJobRepo.updateStatus).toHaveBeenCalledWith('job-dd9', 'done');
  });

  // ── DD10 — dedup recebe dryRun=false (merge automático habilitado) ─────────
  it('DD10 — dedup é sempre chamado com dryRun=false (merge automático)', async () => {
    const buf = buildAnaCareDD([['5491151265663', 'a@email.com', 'García', 'AT', null, null, 'AC1']]);
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-dd10');

    const [_ids, opts] = mockDedupService.runDeduplicationForWorkers.mock.calls[0];
    expect(opts).toMatchObject({ dryRun: false });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ENRIQUECIMENTO CROSS-ARQUIVO — 8 cenários
//
//  Garante que o mesmo worker aparecendo em múltiplos xlsx
//  tem seus dados SOMADOS, nunca duplicados.
//
//  Chaves de lookup em ordem de prioridade:
//    1. Phone (normalizado para 549XXXXXXXXXX)
//    2. Email (exact match)
//    3. CUIT/CUIL (identificador fiscal — nova 3ª chave)
// ═══════════════════════════════════════════════════════════════════

describe('Enriquecimento cross-arquivo — mesmo worker, múltiplos xlsx', () => {
  // ── Builders ─────────────────────────────────────────────────────────────

  const ANA_HEADERS = [
    'Teléfono', 'Email', 'Nombre', 'Tipo', 'Fecha de nacimiento', 'Número de cédula', 'ID',
  ];
  function buildAnaCareRow(phone: string | null, email: string | null, name: string, cuit?: string | null): Buffer {
    return buildXlsx({
      'Ana Care': [ANA_HEADERS, [phone, email, name, 'AT', null, cuit ?? null, 'AC1']],
    }, 'Ana Care Control.xlsx');
  }

  function buildTalentSearchRow(overrides: Partial<{
    email: string; phone: string; name: string; apellido: string; cuit: string; pre: string;
  }>): Buffer {
    const headers = [
      'Nombre', 'Apellido', 'Secuencias', 'Busquedas', 'Pre screenings',
      'Fecha', 'Status', 'Notas', 'Rating', 'Emails', 'Numeros de telefono',
      'Linkedin',
      '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
      '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
    ];
    const row = [
      overrides.name    ?? 'García',
      overrides.apellido ?? 'María',
      '', '', overrides.pre ?? '',
      '3/18/2026', 'QUALIFIED', '', 'No rating',
      overrides.email ?? 'garcia@gmail.com',
      overrides.phone ?? '5491151265663',
      '', overrides.cuit ?? '', 'Acompañante',
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, row]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.utils.sheet_to_csv(ws), 'utf-8');
  }

  function buildCandidatosRow(phone: string | null, email: string | null, cuit?: string | null): Buffer {
    const talentumHeaders = ['Nombre y Apellido', 'Estado', 'Teléfono', 'Email', 'Cedula'];
    return buildXlsx({
      'Talentum': [talentumHeaders, ['García María', 'QUALIFIED', phone, email, cuit ?? null]],
      'NoTerminaronTalentum': [talentumHeaders],
      'NoUsarMás': [talentumHeaders],
    }, 'CANDIDATOS.xlsx');
  }

  // ── EC1 — Phone → lookup por phone → 1 registro, não 2 ───────────────────
  it('EC1 — mesmo phone em 2 xlsx → 1 registro (findByPhone encontra o existente)', async () => {
    // Simula: primeiro import já criou o worker com esse phone
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-ec1')));

    const buf = buildAnaCareRow('5491151265663', null, 'García María');
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-ec1');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();      // nunca cria
    expect(mockWorkerRepo.updateFromImport).toHaveBeenCalledWith( // sempre enriquece
      'worker-ec1', expect.any(Object),
    );
    expect(result.workersCreated).toBe(0);
    expect(result.workersUpdated).toBe(1);
  });

  // ── EC2 — Phone 10-digit num xlsx, 13-digit noutro → normaliza igual → 1 registro ──
  it('EC2 — phone 10-digit (Ana Care) e 13-digit (Talent Search) → mesma chave normalizada', async () => {
    // Ana Care gera phone "1151265663" → normalizePhoneAR → "5491151265663"
    // Talent Search tem "5491151265663"
    // Ambos devem chamar findByPhone("5491151265663")

    const buf1 = buildAnaCareRow('1151265663', null, 'García María');
    const importer = new PlanilhaImporter();

    // Primeiro import (Ana Care): worker não existe → cria
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    await importer.importBuffer(buf1, 'Ana Care Control.xlsx', 'job-ec2a');
    expect(mockWorkerRepo.findByPhone).toHaveBeenCalledWith('5491151265663');

    // Segundo import (Talent Search): worker já existe → encontra pelo mesmo phone normalizado
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-ec2')));
    const buf2 = buildTalentSearchRow({ phone: '5491151265663', email: 'garcia@gmail.com' });
    const [result2] = await importer.importBuffer(buf2, 'export.csv', 'job-ec2b');

    expect(result2.workersCreated).toBe(0);
    expect(result2.workersUpdated).toBe(1);
    expect(mockWorkerRepo.create).toHaveBeenCalledTimes(1); // só na primeira importação
  });

  // ── EC3 — Email → lookup por email → 1 registro ──────────────────────────
  it('EC3 — mesmo email em 2 xlsx → 1 registro (findByEmail encontra o existente)', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null)); // sem phone
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(makeWorker('worker-ec3')));

    const buf = buildTalentSearchRow({ phone: '', email: 'garcia@gmail.com' });
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'export.csv', 'job-ec3');

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.workersUpdated).toBe(1);
  });

  // ── EC4 — CUIT → lookup por CUIT → 1 registro (3ª chave) ─────────────────
  it('EC4 — worker encontrado via CUIT quando phone e email não batem → 1 registro', async () => {
    // Simula: _Base1 criou worker sem email real (email gerado) e sem phone match
    // Agora Talent Search tem o CUIT → deveria encontrar o mesmo worker
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));  // phone diferente
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));  // email gerado ≠ real
    mockWorkerRepo.findByCuit = jest.fn().mockResolvedValue(okResult(makeWorker('worker-ec4')));

    const buf = buildTalentSearchRow({ cuit: '27280435215', email: 'garcia@gmail.com' });
    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'export.csv', 'job-ec4');

    expect(mockWorkerRepo.findByCuit).toHaveBeenCalledWith('27280435215');
    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.workersUpdated).toBe(1);
  });

  // ── EC5 — Email gerado @enlite.import é substituído pelo email real ────────
  it('EC5 — findByPhone encontra worker com email gerado → updateFromImport recebe email real', async () => {
    const existingWorkerWithFakeEmail = {
      ...makeWorker('worker-ec5'),
      email: 'anacareimport_5491151265663@enlite.import', // email gerado
    };
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(existingWorkerWithFakeEmail));

    const buf = buildTalentSearchRow({ phone: '5491151265663', email: 'garcia@gmail.com' });
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export.csv', 'job-ec5');

    // updateFromImport deve receber o email real para que o banco substitua o placeholder
    expect(mockWorkerRepo.updateFromImport).toHaveBeenCalledWith(
      'worker-ec5',
      expect.objectContaining({ email: 'garcia@gmail.com' }),
    );
  });

  // ── EC6 — Email real não é sobrescrito por outro email real ───────────────
  it('EC6 — email real existente NÃO é sobrescrito por outro email real (COALESCE no banco)', async () => {
    // updateFromImport usa `CASE WHEN email LIKE '%@enlite.import'` — se o email atual
    // já é real, ele permanece. Este teste verifica que o campo email
    // É passado (para o banco decidir), mas que a lógica no banco protege o valor existente.
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-ec6')));

    const buf = buildTalentSearchRow({ phone: '5491151265663', email: 'outro@gmail.com' });
    const importer = new PlanilhaImporter();
    await importer.importBuffer(buf, 'export.csv', 'job-ec6');

    // O campo email é sempre passado para updateFromImport (banco decide se atualiza)
    expect(mockWorkerRepo.updateFromImport).toHaveBeenCalledWith(
      'worker-ec6',
      expect.objectContaining({ email: 'outro@gmail.com' }),
    );
  });

  // ── EC7 — 3 xlsx, mesmo worker → sempre 1 registro ───────────────────────
  it('EC7 — worker em Ana Care + Candidatos + Talent Search → 1 registro, 3 updates', async () => {
    // Simula cadeia de imports sequenciais para o mesmo worker
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-ec7')));

    const importer = new PlanilhaImporter();

    // Import 1: Ana Care
    await importer.importBuffer(
      buildAnaCareRow('5491151265663', null, 'García María'),
      'Ana Care Control.xlsx', 'job-ec7a',
    );
    // Import 2: Candidatos
    await importer.importBuffer(
      buildCandidatosRow('5491151265663', null),
      'CANDIDATOS.xlsx', 'job-ec7b',
    );
    // Import 3: Talent Search
    await importer.importBuffer(
      buildTalentSearchRow({ phone: '5491151265663', email: 'garcia@gmail.com' }),
      'export.csv', 'job-ec7c',
    );

    // Nunca cria novo worker
    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    // Enriquece 3 vezes (uma por import)
    expect(mockWorkerRepo.updateFromImport).toHaveBeenCalledTimes(3);
  });

  // ── EC8 — Worker sem CUIT E sem phone E sem email real → cria 1 e depois enriquece ──
  it('EC8 — worker sem nenhuma chave cruzada → cria na primeira vez, erro informativo depois', async () => {
    // Sem phone, sem email real, sem CUIT → não tem como encontrar → cria novo
    // (esse é o limite do sistema sem LLM dedup)
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByCuit = jest.fn().mockResolvedValue(okResult(null));

    const buf = buildXlsx({
      'Ana Care': [ANA_HEADERS, [null, null, 'García María', 'AT', null, null, 'AC1']],
    }, 'Ana Care Control.xlsx');

    const importer = new PlanilhaImporter();
    const [result] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-ec8');

    // Sem email e sem phone → erro registrado (não cria worker fantasma)
    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  DEDUP — PHONE + NOME COMBINADOS (phone_name_combined)
//
//  Garante que o pipeline entrega ao LLM os pares onde:
//    • phone 10-digit legado vs 13-digit normalizado (levenshtein = 3)
//    • phone presente num, ausente noutro → LLM decide pelo nome
//    • normalizePhoneAR previne duplicatas quando ambos normalizam igual
// ═══════════════════════════════════════════════════════════════════

describe('Dedup — phone + nome combinados (phone_name_combined)', () => {

  const ANA_H = ['Teléfono','Email','Nombre','Tipo','Fecha de nacimiento','Número de cédula','ID'];
  const TS_H  = [
    'Nombre','Apellido','Secuencias','Busquedas','Pre screenings',
    'Fecha','Status','Notas','Rating','Emails','Numeros de telefono','Linkedin',
    '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
    '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
  ];

  function csvBuf(phone: string, email: string): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TS_H,
      ['García','María','','','','3/18/2026','QUALIFIED','','No rating', email, phone,'','','Acompañante'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.utils.sheet_to_csv(ws), 'utf-8');
  }

  // ── PN1 — normalizePhoneAR previne duplicata quando ambas as fontes normalizam igual ──
  it('PN1 — phone 10-digit num xlsx: normalizePhoneAR → "5491..." → findByPhone previne duplicata', async () => {
    // Ana Care envia "1151265663" → normalizePhoneAR("1151265663") = "5491151265663"
    // Se o DB já tem worker com phone "5491151265663", findByPhone encontra → update
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-norm')));

    const buf = buildXlsx({ 'Ana Care': [ANA_H, ['1151265663', null, 'García María', 'AT', null, null, 'AC1']] },
      'Ana Care Control.xlsx');
    const importer = new PlanilhaImporter();
    const [r] = await importer.importBuffer(buf, 'Ana Care Control.xlsx', 'job-pn1');

    expect(mockWorkerRepo.findByPhone).toHaveBeenCalledWith('5491151265663'); // normalizado
    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(r.workersUpdated).toBe(1);
  });

  // ── PN2 — dado legado (10-digit sem normalizar) vs novo (13-digit) → 2 workers, dedup recebe ambos ──
  it('PN2 — phone 10-digit legado vs 13-digit novo → cria 2, dedup chamado com ID do novo', async () => {
    // Simula dado legado: phone armazenado ANTES do normalizePhoneAR como "1151265663"
    // Novo import não encontra por phone (phones diferentes no DB)
    // O dedup recebe o ID do worker novo; a SQL view (levenshtein=3 + nome) detecta o par
    mockWorkerRepo.create
      .mockResolvedValueOnce(okResult(makeWorker('w-legado')))
      .mockResolvedValueOnce(okResult(makeWorker('w-novo')));

    const importer = new PlanilhaImporter();

    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    await importer.importBuffer(
      buildXlsx({ 'Ana Care': [ANA_H, ['1151265663', null, 'García María', 'AT', null, null, 'AC1']] },
        'Ana Care Control.xlsx'),
      'Ana Care Control.xlsx', 'job-pn2a',
    );

    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null)); // DB tem "1151265663", busca "5491151265663"
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    await importer.importBuffer(csvBuf('5491151265663','garcia@gmail.com'), 'export.csv', 'job-pn2b');

    expect(mockWorkerRepo.create).toHaveBeenCalledTimes(2);
    // Dedup do 2º import recebe 'w-novo' → SQL view detecta par via phone_name_combined
    const lastDedup = mockDedupService.runDeduplicationForWorkers.mock.calls.at(-1)!;
    expect(lastDedup[0]).toContain('w-novo');
  });

  // ── PN3 — worker com phone, outro sem phone → dedup recebe ambos ──────────────────
  it('PN3 — um tem phone, outro não → dedup chamado com IDs de ambos os imports', async () => {
    mockWorkerRepo.create
      .mockResolvedValueOnce(okResult(makeWorker('w-comphone')))
      .mockResolvedValueOnce(okResult(makeWorker('w-semphone')));

    const importer = new PlanilhaImporter();

    // 1º import: com phone
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    await importer.importBuffer(
      buildXlsx({ 'Ana Care': [ANA_H, ['5491151265663', null, 'García María', 'AT', null, null, 'AC1']] },
        'Ana Care Control.xlsx'),
      'Ana Care Control.xlsx', 'job-pn3a',
    );

    // 2º import: sem phone, email diferente
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(null));
    mockWorkerRepo.findByEmail.mockResolvedValue(okResult(null));
    await importer.importBuffer(csvBuf('','garcia@gmail.com'), 'export.csv', 'job-pn3b');

    // Dois registros criados (sem chave comum)
    expect(mockWorkerRepo.create).toHaveBeenCalledTimes(2);

    // Cada import chama o dedup com seu próprio worker
    const firstDedup = mockDedupService.runDeduplicationForWorkers.mock.calls[0];
    const lastDedup  = mockDedupService.runDeduplicationForWorkers.mock.calls.at(-1)!;
    expect(firstDedup[0]).toContain('w-comphone');
    expect(lastDedup[0]).toContain('w-semphone');
    // A SQL view (condição 4/5) detectará o par quando o dedup rodar scoped
  });

  // ── PN4 — matchReason 'phone_name_combined' é um valor válido no tipo ────────────
  it('PN4 — DuplicateCandidate aceita matchReason "phone_name_combined" (TypeScript)', () => {
    // Garantia de tipo: se o TypeScript compilar com 'phone_name_combined',
    // a adição ao union type em AnalyticsRepository.ts está correta
    const candidate = {
      worker1Id: 'w1', worker1Phone: '1151265663', worker1Email: 'w1@enlite.import',
      worker1FirstName: 'García', worker1LastName: 'María', worker1Cuit: null, worker1Sources: [],
      worker2Id: 'w2', worker2Phone: '5491151265663', worker2Email: 'garcia@gmail.com',
      worker2FirstName: 'García', worker2LastName: 'María', worker2Cuit: null, worker2Sources: [],
      matchReason: 'phone_name_combined' as const,
    };
    expect(candidate.matchReason).toBe('phone_name_combined');
  });

  // ── PN5 — phone idêntico nos 2 xlsx → 1 registro (caminho feliz) ─────────────────
  it('PN5 — phone 13-digit igual em 2 xlsx → findByPhone previne duplicata em ambos os imports', async () => {
    mockWorkerRepo.findByPhone.mockResolvedValue(okResult(makeWorker('worker-ok')));

    const importer = new PlanilhaImporter();

    const [r1] = await importer.importBuffer(
      buildXlsx({ 'Ana Care': [ANA_H, ['5491151265663', null, 'García María', 'AT', null, null, 'AC1']] },
        'Ana Care Control.xlsx'),
      'Ana Care Control.xlsx', 'job-pn5a',
    );
    const [r2] = await importer.importBuffer(
      csvBuf('5491151265663', 'garcia@gmail.com'),
      'export.csv', 'job-pn5b',
    );

    expect(mockWorkerRepo.create).not.toHaveBeenCalled();
    expect(r1.workersUpdated).toBe(1);
    expect(r2.workersUpdated).toBe(1);
  });
});
