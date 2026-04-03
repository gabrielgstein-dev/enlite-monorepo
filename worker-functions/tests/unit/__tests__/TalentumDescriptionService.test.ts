/**
 * TalentumDescriptionService — Unit Tests
 *
 * Coverage: constructor (GROQ_API_KEY validation), generateDescription
 * (DB query, Groq API call, Marco text, DB save), callGroq (prompt assembly,
 * HTTP error, empty response), and all edge cases.
 *
 * Mocks: DatabaseConnection (singleton + Pool), global.fetch (Groq API).
 */

// ── Mocks ────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('../../../src/infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({
      getPool: () => mockPool,
    }),
  },
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
  mockQuery.mockReset();
});

// ── Helpers ──────────────────────────────────────────────────────────

function mockGroqResponse(content: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  };
}

function mockGroqError(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  };
}

function makeVacancyRow(overrides: Record<string, any> = {}) {
  return {
    case_number: 747,
    title: 'Caso 747',
    worker_profile_sought: 'AT con experiencia en adultos mayores',
    required_professions: ['Psicóloga', 'AT'],
    required_sex: 'Femenino',
    required_experience: null,
    schedule: null,
    city: 'Palermo',
    state: 'CABA',
    pathology_types: null,
    dependency_level: 'MODERADA',
    service_device_types: null,
    ...overrides,
  };
}

const MARCO_EXPECTED = 'El Marco de Acompañamiento:\nEnLite Health Solutions ofrece a los prestadores un marco de trabajo';

// ── Tests ────────────────────────────────────────────────────────────

describe('TalentumDescriptionService', () => {
  const origGroqKey = process.env.GROQ_API_KEY;
  const origGroqModel = process.env.GROQ_MODEL;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    delete process.env.GROQ_MODEL;
  });

  afterEach(() => {
    if (origGroqKey !== undefined) process.env.GROQ_API_KEY = origGroqKey;
    else delete process.env.GROQ_API_KEY;
    if (origGroqModel !== undefined) process.env.GROQ_MODEL = origGroqModel;
    else delete process.env.GROQ_MODEL;
  });

  // Need fresh import after mocks
  function createService() {
    // Re-require to pick up env var changes
    const { TalentumDescriptionService } = require('../../../src/infrastructure/services/TalentumDescriptionService');
    return new TalentumDescriptionService();
  }

  // ── Constructor ──────────────────────────────────────────────────
  describe('constructor', () => {
    it('initializes with GROQ_API_KEY from env', () => {
      process.env.GROQ_API_KEY = 'my-api-key';
      const service = createService();
      expect(service).toBeDefined();
    });

    it('throws when GROQ_API_KEY is missing', () => {
      delete process.env.GROQ_API_KEY;
      expect(() => createService()).toThrow('GROQ_API_KEY');
    });

    it('throws when GROQ_API_KEY is empty string', () => {
      process.env.GROQ_API_KEY = '';
      expect(() => createService()).toThrow('GROQ_API_KEY');
    });

    it('uses default model when GROQ_MODEL not set', () => {
      delete process.env.GROQ_MODEL;
      const service = createService();
      expect(service).toBeDefined();
      // Internal model is 'llama-3.3-70b-versatile' — verified via Groq call
    });

    it('uses custom GROQ_MODEL when set', () => {
      process.env.GROQ_MODEL = 'llama-custom-model';
      const service = createService();
      expect(service).toBeDefined();
    });
  });

  // ── generateDescription ──────────────────────────────────────────
  describe('generateDescription()', () => {
    it('happy path: fetches vacancy, calls Groq, appends Marco, saves to DB, returns result', async () => {
      const vacancyRow = makeVacancyRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [vacancyRow] }) // SELECT vacancy
        .mockResolvedValueOnce({ rows: [] }); // UPDATE talentum_description

      const llmOutput = 'Descripción de la Propuesta:\nSe busca...\n\nPerfil Profesional Sugerido:\nMujer...';
      mockFetch.mockResolvedValueOnce(mockGroqResponse(llmOutput));

      const service = createService();
      const result = await service.generateDescription('job-123');

      expect(result.title).toBe('Caso 747');
      expect(result.description).toContain('Descripción de la Propuesta:');
      expect(result.description).toContain('Perfil Profesional Sugerido:');
      expect(result.description).toContain(MARCO_EXPECTED);
    });

    it('always appends Marco text as section 3 (CA-3.2)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('Section 1\n\nSection 2'));

      const service = createService();
      const result = await service.generateDescription('job-1');

      // Marco text is the last section
      const parts = result.description.split('\n\n');
      const lastSection = parts[parts.length - 1];
      expect(lastSection).toContain('El Marco de Acompañamiento:');
      expect(lastSection).toContain('bienestar del paciente.');
    });

    it('saves description to job_postings.talentum_description (CA-3.6)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('Generated text'));

      const service = createService();
      await service.generateDescription('job-save');

      // Verify UPDATE query was called
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE job_postings SET talentum_description');
      expect(updateCall[1][0]).toContain('Generated text');
      expect(updateCall[1][0]).toContain('El Marco de Acompañamiento:');
      expect(updateCall[1][1]).toBe('job-save');
    });

    it('throws when job posting not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const service = createService();
      await expect(service.generateDescription('missing-id'))
        .rejects.toThrow('Job posting missing-id not found');
    });

    it('handles vacancy without patient data (LEFT JOIN nulls)', async () => {
      const rowNoPatient = makeVacancyRow({
        required_professions: null,
        required_sex: null,
        city: null,
        state: null,
        dependency_level: null,
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [rowNoPatient] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('No patient data description'));

      const service = createService();
      const result = await service.generateDescription('job-no-patient');

      expect(result.description).toBeTruthy();
      // Verify prompt includes 'No especificado' for missing fields
      const groqCall = mockFetch.mock.calls[0];
      const body = JSON.parse(groqCall[1].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('No especificado');
    });

    it('uses title fallback when title is null', async () => {
      const rowNoTitle = makeVacancyRow({ title: null, case_number: 999 });
      mockQuery
        .mockResolvedValueOnce({ rows: [rowNoTitle] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('Description'));

      const service = createService();
      const result = await service.generateDescription('job-no-title');

      expect(result.title).toBe('Caso 999');
    });

    it('handles profession as array (joins with comma)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ required_professions: ['AT', 'Enfermera'] })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-prof');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('AT, Enfermera');
    });

    it('handles profession as non-array (shows No especificado)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ required_professions: null })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-no-prof');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('Tipo de Profesional: No especificado');
    });
  });

  // ── callGroq ──────────────────────────────────────────────────────
  describe('callGroq (Groq API interaction)', () => {
    it('sends correct model and temperature (CA-3.5)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-model');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('llama-3.3-70b-versatile');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(800);
    });

    it('sends custom model from GROQ_MODEL env', async () => {
      process.env.GROQ_MODEL = 'custom-model-v2';
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-custom-model');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('custom-model-v2');
    });

    it('sends Authorization header with Bearer token', async () => {
      process.env.GROQ_API_KEY = 'my-secret-key';
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-auth');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-secret-key');
    });

    it('sends system prompt in Spanish about Talentum description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-prompt');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMsg = body.messages[0];
      expect(systemMsg.role).toBe('system');
      expect(systemMsg.content).toContain('Descripción de la Propuesta');
      expect(systemMsg.content).toContain('Perfil Profesional Sugerido');
    });

    it('throws on Groq HTTP error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeVacancyRow()] });
      mockFetch.mockResolvedValueOnce(mockGroqError(429, 'Rate limit exceeded'));

      const service = createService();
      await expect(service.generateDescription('job-rate-limit'))
        .rejects.toThrow('Groq API error 429');
    });

    it('throws on empty Groq response (no content)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeVacancyRow()] });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '' } }] }),
      });

      const service = createService();
      await expect(service.generateDescription('job-empty'))
        .rejects.toThrow('Empty response from Groq API');
    });

    it('throws on empty choices array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeVacancyRow()] });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }),
      });

      const service = createService();
      await expect(service.generateDescription('job-no-choices'))
        .rejects.toThrow('Empty response from Groq API');
    });

    it('trims LLM output before appending Marco text', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow()] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('  text with whitespace  \n\n'));

      const service = createService();
      const result = await service.generateDescription('job-trim');

      // Should not have triple newlines from trailing whitespace
      expect(result.description).toMatch(/^text with whitespace\n\nEl Marco/);
    });

    it('includes zone from city + state combined', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ city: 'Palermo', state: 'CABA' })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-zone');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('Zona: Palermo, CABA');
    });

    it('handles zone with only city (no state)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ city: 'Belgrano', state: null })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-city-only');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[1].content).toContain('Zona: Belgrano');
    });

    it('handles zone with neither city nor state', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ city: null, state: null })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-no-zone');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[1].content).toContain('Zona: No especificado');
    });

    it('includes pathology_types in prompt when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeVacancyRow({ pathology_types: 'Alzheimer leve' })] })
        .mockResolvedValueOnce({ rows: [] });
      mockFetch.mockResolvedValueOnce(mockGroqResponse('text'));

      const service = createService();
      await service.generateDescription('job-pathology');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[1].content).toContain('Patologías: Alzheimer leve');
    });
  });
});
