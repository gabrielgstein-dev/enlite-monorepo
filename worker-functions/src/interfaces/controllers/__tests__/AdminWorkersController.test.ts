/**
 * AdminWorkersController.test.ts
 *
 * Testes unitários para o método getWorkerById do AdminWorkersController.
 *
 * Cenários cobertos:
 *   1. Happy path — worker encontrado com todos os dados relacionados
 *   2. 404 — worker não encontrado (zero rows)
 *   3. 500 — erro de banco de dados
 *   4. 500 — erro de decryption
 *   5. Worker sem documentos (documents: null)
 *   6. Worker sem location (location: null)
 *   7. Worker sem encuadres (encuadres: [])
 *   8. Worker sem service areas (serviceAreas: [])
 *   9. Eligibility: isMatchable/isActive para cada status
 *  10. Platform mapping (talentum, enlite_app, planilla_operativa, etc.)
 *  11. Languages parsing (JSON válido, string simples, null)
 *  12. Encuadre patientName (first + last, somente first, null)
 *  13. Decrypt é chamado para todos os 15 campos PII
 */

const mockQuery = jest.fn();
const mockDecrypt = jest.fn();

jest.mock('../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: mockQuery,
      }),
    }),
  },
}));

jest.mock('../../../infrastructure/security/KMSEncryptionService', () => ({
  KMSEncryptionService: jest.fn().mockImplementation(() => ({
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: mockDecrypt,
    encryptBatch: jest.fn().mockResolvedValue({}),
  })),
}));

import { AdminWorkersController } from '../AdminWorkersController';
import { Request, Response } from 'express';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReqRes(
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): [Request, Response] {
  const req = { params, query, body: {} } as unknown as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return [req, res];
}

const WORKER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeWorkerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKER_ID,
    email: 'maria@example.com',
    phone: '+5491188888888',
    country: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    status: 'REGISTERED',
    data_sources: ['candidatos'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
    deleted_at: null,
    document_type: 'DNI',
    profession: 'CAREGIVER',
    occupation: 'AT',
    knowledge_level: 'UNIVERSITY',
    title_certificate: 'Diploma AT',
    experience_types: ['TEA', 'DOWN'],
    years_experience: '5_10',
    preferred_types: ['TEA'],
    preferred_age_range: ['children'],
    hobbies: ['leitura'],
    diagnostic_preferences: ['TEA'],
    first_name_encrypted: 'enc_first',
    last_name_encrypted: 'enc_last',
    birth_date_encrypted: 'enc_birth',
    sex_encrypted: 'enc_sex',
    gender_encrypted: 'enc_gender',
    document_number_encrypted: 'enc_doc',
    profile_photo_url_encrypted: 'enc_photo',
    languages_encrypted: 'enc_langs',
    whatsapp_phone_encrypted: 'enc_whatsapp',
    linkedin_url_encrypted: 'enc_linkedin',
    sexual_orientation_encrypted: 'enc_orientation',
    race_encrypted: 'enc_race',
    religion_encrypted: 'enc_religion',
    weight_kg_encrypted: 'enc_weight',
    height_cm_encrypted: 'enc_height',
    ...overrides,
  };
}

function makeDocRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    resume_cv_url: 'https://storage/cv.pdf',
    identity_document_url: 'https://storage/dni.pdf',
    criminal_record_url: null,
    professional_registration_url: null,
    liability_insurance_url: null,
    additional_certificates_urls: ['https://storage/cert1.pdf'],
    documents_status: 'submitted',
    review_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    submitted_at: '2025-02-01T00:00:00Z',
    ...overrides,
  };
}

function makeServiceAreaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sa-1',
    address_line: 'Av. Corrientes 1234',
    latitude: '-34.60368',
    longitude: '-58.38159',
    radius_km: 10,
    ...overrides,
  };
}

function makeLocationRow(overrides: Record<string, unknown> = {}) {
  return {
    address: 'Calle Falsa 123',
    city: 'Buenos Aires',
    work_zone: 'Palermo',
    interest_zone: 'Belgrano',
    ...overrides,
  };
}

function makeEncuadreRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enc-1',
    job_posting_id: 'jp-1',
    case_number: 42,
    patient_first_name: 'Juan',
    patient_last_name: 'Perez',
    resultado: 'SELECCIONADO',
    interview_date: '2025-03-01',
    interview_time: '10:00',
    recruiter_name: 'Ana',
    coordinator_name: 'Carlos',
    rejection_reason: null,
    rejection_reason_category: null,
    attended: true,
    created_at: '2025-03-01T10:00:00Z',
    ...overrides,
  };
}

/**
 * Configura mockQuery para retornar os dados de getWorkerById.
 * Chamada 1: worker query
 * Chamadas 2-5: docs, serviceAreas, locations, encuadres (em Promise.all)
 */
function setupFullMocks(opts: {
  workerRow?: Record<string, unknown> | null;
  docRows?: Record<string, unknown>[];
  serviceAreaRows?: Record<string, unknown>[];
  locationRows?: Record<string, unknown>[];
  encuadreRows?: Record<string, unknown>[];
} = {}) {
  const workerRow = opts.workerRow === undefined ? makeWorkerRow() : opts.workerRow;

  mockQuery
    .mockResolvedValueOnce({ rows: workerRow ? [workerRow] : [] }) // worker
    .mockResolvedValueOnce({ rows: opts.docRows ?? [makeDocRow()] }) // docs
    .mockResolvedValueOnce({ rows: opts.serviceAreaRows ?? [makeServiceAreaRow()] }) // service areas
    .mockResolvedValueOnce({ rows: opts.locationRows ?? [makeLocationRow()] }) // locations
    .mockResolvedValueOnce({ rows: opts.encuadreRows ?? [makeEncuadreRow()] }); // encuadres

  // Default decrypt: remove "enc_" prefix
  mockDecrypt.mockImplementation((val: string | null) =>
    Promise.resolve(val ? val.replace('enc_', '') : null),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// =============================================================================
// listWorkers
// =============================================================================

describe('AdminWorkersController — listWorkers', () => {
  let controller: AdminWorkersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminWorkersController();
    mockDecrypt.mockImplementation((val: string | null) =>
      Promise.resolve(val ? val.replace('enc_', '') : null),
    );
  });

  function makeListRow(overrides: Record<string, unknown> = {}) {
    return {
      id: WORKER_ID,
      email: 'maria@example.com',
      first_name_encrypted: 'enc_Maria',
      last_name_encrypted: 'enc_Garcia',
      data_sources: ['candidatos'],
      created_at: '2025-01-01T00:00:00Z',
      documents_status: 'submitted',
      cases_count: '3',
      ...overrides,
    };
  }

  it('retorna 200 com dados paginados', async () => {
    // count query
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
    // data query
    mockQuery.mockResolvedValueOnce({ rows: [makeListRow()] });
    const [req, res] = mockReqRes({}, { limit: '10', offset: '0' } as any);

    await controller.listWorkers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Maria Garcia');
    expect(body.data[0].casesCount).toBe(3);
    expect(body.data[0].documentsComplete).toBe(true);
    expect(body.data[0].platform).toBe('talentum');
  });

  it('aplica filtro platform=talentum', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({}, { platform: 'talentum' } as any);

    await controller.listWorkers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Verifica que o SQL contém filtro de talentum (não usa parâmetro $1)
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("candidatos");
  });

  it('aplica filtro platform=enlite_app', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({}, { platform: 'enlite_app' } as any);

    await controller.listWorkers(req, res);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("data_sources IS NULL");
  });

  it('aplica filtro platform customizado via parâmetro', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({}, { platform: 'ana_care' } as any);

    await controller.listWorkers(req, res);

    // O parâmetro deve ser passado como $1 via bind
    expect(mockQuery.mock.calls[0][1]).toContain('ana_care');
  });

  it('aplica filtro docs_complete=complete', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({}, { docs_complete: 'complete' } as any);

    await controller.listWorkers(req, res);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("submitted");
  });

  it('aplica filtro docs_complete=incomplete', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({}, { docs_complete: 'incomplete' } as any);

    await controller.listWorkers(req, res);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("NOT IN");
  });

  it('usa email como fallback quando nome descriptografado é vazio', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [makeListRow({ first_name_encrypted: null, last_name_encrypted: null })],
    });
    mockDecrypt.mockResolvedValue(null);
    const [req, res] = mockReqRes({});

    await controller.listWorkers(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.data[0].name).toBe('maria@example.com');
  });

  it('retorna documentsComplete=false para status pending', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [makeListRow({ documents_status: 'pending' })],
    });
    const [req, res] = mockReqRes({});

    await controller.listWorkers(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.data[0].documentsComplete).toBe(false);
  });

  it('trata total nulo do count como 0', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: null }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const [req, res] = mockReqRes({});

    await controller.listWorkers(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.total).toBe(0);
  });

  it('trata cases_count nulo e data_sources nulo no row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [makeListRow({ cases_count: null, data_sources: null, documents_status: 'rejected' })],
    });
    const [req, res] = mockReqRes({});

    await controller.listWorkers(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.data[0].casesCount).toBe(0);
    expect(body.data[0].platform).toBe('enlite_app');
    expect(body.data[0].documentsComplete).toBe(false);
  });

  it('retorna 500 em caso de erro', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const [req, res] = mockReqRes({});

    await controller.listWorkers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Failed to list workers' }),
    );
  });
});

// =============================================================================
// getWorkerDateStats
// =============================================================================

describe('AdminWorkersController — getWorkerDateStats', () => {
  let controller: AdminWorkersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminWorkersController();
  });

  it('retorna 200 com stats de hoje, ontem e 7 dias atrás', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ today: '5', yesterday: '3', seven_days_ago: '10' }],
    });
    const [req, res] = mockReqRes({});

    await controller.getWorkerDateStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { today: 5, yesterday: 3, sevenDaysAgo: 10 },
    });
  });

  it('retorna 500 em caso de erro', async () => {
    mockQuery.mockRejectedValueOnce(new Error('stats error'));
    const [req, res] = mockReqRes({});

    await controller.getWorkerDateStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Erro ao buscar estatísticas de workers',
      }),
    );
  });
});

// =============================================================================
// getWorkerById
// =============================================================================

describe('AdminWorkersController — getWorkerById', () => {
  let controller: AdminWorkersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminWorkersController();
  });

  // ── Cenário 1: Happy path ──────────────────────────────────────────────────

  describe('worker encontrado com dados completos', () => {
    it('retorna 200 com success: true', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('retorna todos os campos de identidade descriptografados', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.firstName).toBe('first');
      expect(data.lastName).toBe('last');
      expect(data.sex).toBe('sex');
      expect(data.gender).toBe('gender');
      expect(data.birthDate).toBe('birth');
      expect(data.documentNumber).toBe('doc');
      expect(data.profilePhotoUrl).toBe('photo');
      expect(data.whatsappPhone).toBe('whatsapp');
      expect(data.linkedinUrl).toBe('linkedin');
      expect(data.sexualOrientation).toBe('orientation');
      expect(data.race).toBe('race');
      expect(data.religion).toBe('religion');
      expect(data.weightKg).toBe('weight');
      expect(data.heightCm).toBe('height');
    });

    it('retorna campos de worker não-criptografados corretamente', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.id).toBe(WORKER_ID);
      expect(data.email).toBe('maria@example.com');
      expect(data.phone).toBe('+5491188888888');
      expect(data.country).toBe('AR');
      expect(data.status).toBe('REGISTERED');
      expect(data.profession).toBe('CAREGIVER');
      expect(data.occupation).toBe('AT');
      expect(data.experienceTypes).toEqual(['TEA', 'DOWN']);
      expect(data.hobbies).toEqual(['leitura']);
    });

    it('retorna documents com shape correto', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { documents } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(documents).not.toBeNull();
      expect(documents.id).toBe('doc-1');
      expect(documents.resumeCvUrl).toBe('https://storage/cv.pdf');
      expect(documents.identityDocumentUrl).toBe('https://storage/dni.pdf');
      expect(documents.criminalRecordUrl).toBeNull();
      expect(documents.additionalCertificatesUrls).toEqual(['https://storage/cert1.pdf']);
      expect(documents.documentsStatus).toBe('submitted');
    });

    it('retorna serviceAreas com lat/lng parseados', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { serviceAreas } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(serviceAreas).toHaveLength(1);
      expect(serviceAreas[0].id).toBe('sa-1');
      expect(serviceAreas[0].address).toBe('Av. Corrientes 1234');
      expect(serviceAreas[0].lat).toBe(-34.60368);
      expect(serviceAreas[0].lng).toBe(-58.38159);
      expect(serviceAreas[0].serviceRadiusKm).toBe(10);
    });

    it('retorna location com shape correto', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { location } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(location).not.toBeNull();
      expect(location.address).toBe('Calle Falsa 123');
      expect(location.city).toBe('Buenos Aires');
      expect(location.workZone).toBe('Palermo');
      expect(location.interestZone).toBe('Belgrano');
    });

    it('retorna encuadres com patientName concatenado', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres).toHaveLength(1);
      expect(encuadres[0].id).toBe('enc-1');
      expect(encuadres[0].patientName).toBe('Juan Perez');
      expect(encuadres[0].caseNumber).toBe(42);
      expect(encuadres[0].resultado).toBe('SELECCIONADO');
      expect(encuadres[0].attended).toBe(true);
    });
  });

  // ── Cenário 2: 404 ────────────────────────────────────────────────────────

  describe('worker não encontrado', () => {
    it('retorna 404 com error message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Worker not found',
      });
    });

    it('não executa queries de dados relacionados quando worker não existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      // Apenas a query do worker foi executada
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockDecrypt).not.toHaveBeenCalled();
    });
  });

  // ── Cenário 3: Erro de banco ──────────────────────────────────────────────

  describe('erro de banco de dados', () => {
    it('retorna 500 quando a query principal falha', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to get worker details',
          details: 'connection refused',
        }),
      );
    });

    it('retorna 500 quando query de dados relacionados falha', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeWorkerRow()] }) // worker OK
        .mockRejectedValueOnce(new Error('timeout on docs query')); // docs fail
      mockDecrypt.mockResolvedValue('decrypted');

      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── Cenário 4: Erro de decryption ─────────────────────────────────────────

  describe('erro de decryption KMS', () => {
    it('retorna 500 quando decrypt falha', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeWorkerRow()] });
      mockDecrypt.mockRejectedValue(new Error('KMS unavailable'));

      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          details: 'KMS unavailable',
        }),
      );
    });
  });

  // ── Cenário 5: Sem documentos ─────────────────────────────────────────────

  describe('worker sem documentos', () => {
    it('retorna documents: null quando não há registro em worker_documents', async () => {
      setupFullMocks({ docRows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { documents } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(documents).toBeNull();
    });
  });

  // ── Cenário 6: Sem location ───────────────────────────────────────────────

  describe('worker sem location', () => {
    it('retorna location: null quando não há registro em worker_locations', async () => {
      setupFullMocks({ locationRows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { location } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(location).toBeNull();
    });
  });

  // ── Cenário 7: Sem encuadres ──────────────────────────────────────────────

  describe('worker sem encuadres', () => {
    it('retorna encuadres: [] quando não há registros', async () => {
      setupFullMocks({ encuadreRows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres).toEqual([]);
    });
  });

  // ── Cenário 8: Sem service areas ──────────────────────────────────────────

  describe('worker sem service areas', () => {
    it('retorna serviceAreas: [] quando não há registros', async () => {
      setupFullMocks({ serviceAreaRows: [] });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { serviceAreas } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(serviceAreas).toEqual([]);
    });
  });

  // ── Cenário 9: Eligibility ────────────────────────────────────────────────

  describe('isMatchable e isActive', () => {
    it('REGISTERED + não deletado → isMatchable=true, isActive=true', async () => {
      setupFullMocks({ workerRow: makeWorkerRow({ status: 'REGISTERED', deleted_at: null }) });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.isMatchable).toBe(true);
      expect(data.isActive).toBe(true);
    });

    it('INCOMPLETE_REGISTER → isMatchable=false, isActive=true', async () => {
      setupFullMocks({ workerRow: makeWorkerRow({ status: 'INCOMPLETE_REGISTER' }) });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.isMatchable).toBe(false);
      expect(data.isActive).toBe(true);
    });

    it('DISABLED → isMatchable=false, isActive=false', async () => {
      setupFullMocks({ workerRow: makeWorkerRow({ status: 'DISABLED' }) });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.isMatchable).toBe(false);
      expect(data.isActive).toBe(false);
    });

    it('REGISTERED + deleted_at presente → isMatchable=false, isActive=false', async () => {
      setupFullMocks({
        workerRow: makeWorkerRow({ status: 'REGISTERED', deleted_at: '2025-06-01T00:00:00Z' }),
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.isMatchable).toBe(false);
      expect(data.isActive).toBe(false);
    });
  });

  // ── Cenário 10: Platform mapping ──────────────────────────────────────────

  describe('platform mapping', () => {
    it.each([
      { dataSources: ['candidatos'], expected: 'talentum' },
      { dataSources: ['candidatos_no_terminaron'], expected: 'talentum' },
      { dataSources: ['planilla_operativa'], expected: 'planilla_operativa' },
      { dataSources: ['ana_care'], expected: 'ana_care' },
      { dataSources: ['talent_search'], expected: 'talent_search' },
      { dataSources: null, expected: 'enlite_app' },
      { dataSources: [], expected: 'enlite_app' },
      { dataSources: ['custom_source'], expected: 'custom_source' },
    ])('data_sources=$dataSources → platform=$expected', async ({ dataSources, expected }) => {
      setupFullMocks({ workerRow: makeWorkerRow({ data_sources: dataSources }) });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.platform).toBe(expected);
    });
  });

  // ── Cenário 11: Languages parsing ─────────────────────────────────────────

  describe('languages parsing', () => {
    it('parseia JSON array corretamente', async () => {
      setupFullMocks();
      mockDecrypt.mockImplementation((val: string | null) => {
        if (val === 'enc_langs') return Promise.resolve('["es","pt"]');
        return Promise.resolve(val ? val.replace('enc_', '') : null);
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.languages).toEqual(['es', 'pt']);
    });

    it('usa string como fallback quando JSON parsing falha', async () => {
      setupFullMocks();
      mockDecrypt.mockImplementation((val: string | null) => {
        if (val === 'enc_langs') return Promise.resolve('espanol');
        return Promise.resolve(val ? val.replace('enc_', '') : null);
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.languages).toEqual(['espanol']);
    });

    it('retorna array vazio quando languages é null', async () => {
      setupFullMocks();
      mockDecrypt.mockImplementation((val: string | null) => {
        if (val === 'enc_langs') return Promise.resolve(null);
        return Promise.resolve(val ? val.replace('enc_', '') : null);
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.languages).toEqual([]);
    });
  });

  // ── Cenário 12: patientName concatenation ─────────────────────────────────

  describe('encuadre patientName', () => {
    it('concatena first + last name do paciente', async () => {
      setupFullMocks({
        encuadreRows: [makeEncuadreRow({ patient_first_name: 'Ana', patient_last_name: 'Lopez' })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres[0].patientName).toBe('Ana Lopez');
    });

    it('usa somente first name quando last é null', async () => {
      setupFullMocks({
        encuadreRows: [makeEncuadreRow({ patient_first_name: 'Ana', patient_last_name: null })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres[0].patientName).toBe('Ana');
    });

    it('retorna null quando ambos nomes são null', async () => {
      setupFullMocks({
        encuadreRows: [makeEncuadreRow({ patient_first_name: null, patient_last_name: null })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres[0].patientName).toBeNull();
    });
  });

  // ── Cenário 13: Decrypt chamado para todos os 15 campos ──────────────────

  describe('decrypt é chamado para todos os campos PII', () => {
    it('chama decrypt exatamente 15 vezes (um por campo PII)', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(mockDecrypt).toHaveBeenCalledTimes(15);
      expect(mockDecrypt).toHaveBeenCalledWith('enc_first');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_last');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_birth');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_sex');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_gender');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_doc');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_photo');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_langs');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_whatsapp');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_linkedin');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_orientation');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_race');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_religion');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_weight');
      expect(mockDecrypt).toHaveBeenCalledWith('enc_height');
    });
  });

  // ── Cenário 14: Null coalescing para campos opcionais ─────────────────────

  describe('campos null do worker são retornados como null', () => {
    it('campos opcionais null não quebram o response', async () => {
      setupFullMocks({
        workerRow: makeWorkerRow({
          phone: null,
          data_sources: null,
          document_type: null,
          profession: null,
          occupation: null,
          knowledge_level: null,
          title_certificate: null,
          experience_types: null,
          years_experience: null,
          preferred_types: null,
          preferred_age_range: null,
          hobbies: null,
          diagnostic_preferences: null,
        }),
      });
      mockDecrypt.mockResolvedValue(null);
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.phone).toBeNull();
      expect(data.dataSources).toEqual([]);
      expect(data.platform).toBe('enlite_app');
      expect(data.profession).toBeNull();
      expect(data.occupation).toBeNull();
      expect(data.knowledgeLevel).toBeNull();
      expect(data.titleCertificate).toBeNull();
      expect(data.experienceTypes).toEqual([]);
      expect(data.yearsExperience).toBeNull();
      expect(data.preferredTypes).toEqual([]);
      expect(data.preferredAgeRange).toEqual([]);
      expect(data.hobbies).toEqual([]);
      expect(data.diagnosticPreferences).toEqual([]);
      expect(data.firstName).toBeNull();
      expect(data.lastName).toBeNull();
      expect(data.whatsappPhone).toBeNull();
      expect(data.linkedinUrl).toBeNull();
      expect(data.documentNumber).toBeNull();
      expect(data.documentType).toBeNull();
    });
  });

  // ── Cenário extra: documents com campos null ────────────────────────────────

  describe('documents com campos null', () => {
    it('usa defaults para documents_status e additional_certificates_urls', async () => {
      setupFullMocks({
        docRows: [makeDocRow({
          documents_status: null,
          additional_certificates_urls: null,
          resume_cv_url: null,
          identity_document_url: null,
          review_notes: null,
          reviewed_by: null,
          reviewed_at: null,
          submitted_at: null,
        })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { documents } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(documents.documentsStatus).toBe('pending');
      expect(documents.additionalCertificatesUrls).toEqual([]);
      expect(documents.resumeCvUrl).toBeNull();
      expect(documents.identityDocumentUrl).toBeNull();
      expect(documents.reviewNotes).toBeNull();
      expect(documents.reviewedBy).toBeNull();
      expect(documents.reviewedAt).toBeNull();
      expect(documents.submittedAt).toBeNull();
    });
  });

  // ── Cenário extra: documents com todos os campos presentes ────────────────

  describe('documents com campos opcionais preenchidos', () => {
    it('mapeia todos os campos de documents corretamente', async () => {
      setupFullMocks({
        docRows: [makeDocRow({
          review_notes: 'Tudo ok',
          reviewed_by: 'admin-1',
          reviewed_at: '2025-03-01T00:00:00Z',
          criminal_record_url: 'https://storage/ap.pdf',
          professional_registration_url: 'https://storage/reg.pdf',
          liability_insurance_url: 'https://storage/seg.pdf',
        })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { documents } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(documents.reviewNotes).toBe('Tudo ok');
      expect(documents.reviewedBy).toBe('admin-1');
      expect(documents.reviewedAt).toBe('2025-03-01T00:00:00Z');
      expect(documents.criminalRecordUrl).toBe('https://storage/ap.pdf');
      expect(documents.professionalRegistrationUrl).toBe('https://storage/reg.pdf');
      expect(documents.liabilityInsuranceUrl).toBe('https://storage/seg.pdf');
    });
  });

  // ── Cenário extra: encuadre com campos null ───────────────────────────────

  describe('encuadre com campos opcionais null', () => {
    it('mapeia nulls corretamente', async () => {
      setupFullMocks({
        encuadreRows: [makeEncuadreRow({
          job_posting_id: null,
          case_number: null,
          resultado: null,
          interview_date: null,
          interview_time: null,
          recruiter_name: null,
          coordinator_name: null,
          rejection_reason: null,
          rejection_reason_category: null,
          attended: null,
        })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const enc = (res.json as jest.Mock).mock.calls[0][0].data.encuadres[0];
      expect(enc.jobPostingId).toBeNull();
      expect(enc.caseNumber).toBeNull();
      expect(enc.resultado).toBeNull();
      expect(enc.interviewDate).toBeNull();
      expect(enc.interviewTime).toBeNull();
      expect(enc.recruiterName).toBeNull();
      expect(enc.coordinatorName).toBeNull();
      expect(enc.rejectionReason).toBeNull();
      expect(enc.rejectionReasonCategory).toBeNull();
      expect(enc.attended).toBeNull();
    });
  });

  // ── Cenário 15: Service area com campos null ────────────────────────────

  describe('service area com campos null', () => {
    it('retorna lat/lng como null quando latitude/longitude são null', async () => {
      setupFullMocks({
        serviceAreaRows: [makeServiceAreaRow({
          latitude: null,
          longitude: null,
          address_line: null,
          radius_km: null,
        })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { serviceAreas } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(serviceAreas[0].lat).toBeNull();
      expect(serviceAreas[0].lng).toBeNull();
      expect(serviceAreas[0].address).toBeNull();
      expect(serviceAreas[0].serviceRadiusKm).toBeNull();
    });
  });

  // ── Cenário extra: location com campos null ───────────────────────────────

  describe('location com campos null', () => {
    it('retorna campos null quando location row tem nulls', async () => {
      setupFullMocks({
        locationRows: [makeLocationRow({
          address: null,
          city: null,
          work_zone: null,
          interest_zone: null,
        })],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { location } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(location).not.toBeNull();
      expect(location.address).toBeNull();
      expect(location.city).toBeNull();
      expect(location.workZone).toBeNull();
      expect(location.interestZone).toBeNull();
    });
  });

  // ── Cenário 16: Múltiplos encuadres ───────────────────────────────────────

  describe('múltiplos encuadres', () => {
    it('retorna todos os encuadres na ordem recebida', async () => {
      setupFullMocks({
        encuadreRows: [
          makeEncuadreRow({ id: 'enc-1', resultado: 'SELECCIONADO' }),
          makeEncuadreRow({ id: 'enc-2', resultado: 'RECHAZADO', rejection_reason_category: 'DISTANCE' }),
        ],
      });
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      const { encuadres } = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(encuadres).toHaveLength(2);
      expect(encuadres[0].resultado).toBe('SELECCIONADO');
      expect(encuadres[1].resultado).toBe('RECHAZADO');
      expect(encuadres[1].rejectionReasonCategory).toBe('DISTANCE');
    });
  });

  // ── Cenário 17: Query parametrizada com o id correto ──────────────────────

  describe('query usa o id do params', () => {
    it('passa o UUID correto para todas as queries', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({ id: WORKER_ID });

      await controller.getWorkerById(req, res);

      // Query 1: worker
      expect(mockQuery.mock.calls[0][1]).toEqual([WORKER_ID]);
      // Queries 2-5: related data (docs, service areas, locations, encuadres)
      expect(mockQuery.mock.calls[1][1]).toEqual([WORKER_ID]);
      expect(mockQuery.mock.calls[2][1]).toEqual([WORKER_ID]);
      expect(mockQuery.mock.calls[3][1]).toEqual([WORKER_ID]);
      expect(mockQuery.mock.calls[4][1]).toEqual([WORKER_ID]);
    });
  });
});

// =============================================================================
// getWorkerByPhone
// =============================================================================

describe('AdminWorkersController — getWorkerByPhone', () => {
  let controller: AdminWorkersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminWorkersController();
    mockDecrypt.mockImplementation((val: string | null) =>
      Promise.resolve(val ? val.replace('enc_', '') : null),
    );
  });

  // ── Cenário 1: 200 — worker encontrado ────────────────────────────────────

  describe('worker encontrado por telefone', () => {
    it('retorna 200 com success: true e dados completos', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({}, { phone: '+5491188888888' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('retorna os mesmos campos que getWorkerById', async () => {
      setupFullMocks();
      const [req, res] = mockReqRes({}, { phone: '+5491188888888' });

      await controller.getWorkerByPhone(req, res);

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.id).toBe(WORKER_ID);
      expect(data.email).toBe('maria@example.com');
      expect(data.firstName).toBe('first');
      expect(data.lastName).toBe('last');
      expect(data.phone).toBe('+5491188888888');
      expect(data.documents).not.toBeNull();
      expect(data.serviceAreas).toHaveLength(1);
      expect(data.location).not.toBeNull();
      expect(data.encuadres).toHaveLength(1);
    });

    it('passa array de candidatos (ANY) como parâmetro da query SQL', async () => {
      setupFullMocks();
      const phone = '+5491188888888';
      const [req, res] = mockReqRes({}, { phone });

      await controller.getWorkerByPhone(req, res);

      // pool.query(sql, [candidates]) — o segundo arg é [candidatesArray]
      const queryParams = mockQuery.mock.calls[0][1] as string[][];
      const candidates = queryParams[0] as string[];
      expect(Array.isArray(candidates)).toBe(true);
      // Deve conter ao menos o canônico derivado de +5491188888888
      expect(candidates).toContain('5491188888888');
    });
  });

  // ── Cenário 2: 404 — worker não encontrado ─────────────────────────────────

  describe('worker não encontrado', () => {
    it('retorna 404 quando nenhuma row é retornada', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const [req, res] = mockReqRes({}, { phone: '9999999999' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Worker not found' });
    });

    it('não executa queries de dados relacionados quando worker não existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const [req, res] = mockReqRes({}, { phone: '9999999999' });

      await controller.getWorkerByPhone(req, res);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockDecrypt).not.toHaveBeenCalled();
    });
  });

  // ── Cenário 3: 400 — phone ausente ────────────────────────────────────────

  describe('query param phone ausente', () => {
    it('retorna 400 quando phone não é fornecido', async () => {
      const [req, res] = mockReqRes({}, {});

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query parameter "phone" is required',
      });
    });

    it('não executa nenhuma query quando phone está ausente', async () => {
      const [req, res] = mockReqRes({}, {});

      await controller.getWorkerByPhone(req, res);

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── Cenário 4: 400 — phone vazio ──────────────────────────────────────────

  describe('query param phone vazio', () => {
    it('retorna 400 quando phone é string vazia', async () => {
      const [req, res] = mockReqRes({}, { phone: '' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query parameter "phone" is required',
      });
    });

    it('retorna 400 quando phone é somente espaços em branco', async () => {
      const [req, res] = mockReqRes({}, { phone: '   ' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ── Cenário 5: 500 — erro de banco ────────────────────────────────────────

  describe('erro de banco de dados', () => {
    it('retorna 500 quando a query principal falha', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      const [req, res] = mockReqRes({}, { phone: '+5491188888888' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to get worker details',
          details: 'connection refused',
        }),
      );
    });

    it('retorna 500 quando query de dados relacionados falha', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeWorkerRow()] })
        .mockRejectedValueOnce(new Error('timeout on docs query'));
      mockDecrypt.mockResolvedValue('decrypted');
      const [req, res] = mockReqRes({}, { phone: '+5491188888888' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── Cenário 6: 500 — erro de decryption ──────────────────────────────────

  describe('erro de decryption KMS', () => {
    it('retorna 500 quando decrypt falha', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeWorkerRow()] });
      mockDecrypt.mockRejectedValue(new Error('KMS unavailable'));
      const [req, res] = mockReqRes({}, { phone: '+5491188888888' });

      await controller.getWorkerByPhone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          details: 'KMS unavailable',
        }),
      );
    });
  });
});
