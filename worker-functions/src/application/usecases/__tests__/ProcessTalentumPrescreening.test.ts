/**
 * ProcessTalentumPrescreening.test.ts
 *
 * Testa a emissão de domain events no fluxo QUALIFIED (Step 4).
 *
 * Cenários:
 * 1. Insere domain_event ao transitar para QUALIFIED
 * 2. Não insere domain_event se já era QUALIFIED (deduplicação)
 * 3. Não insere domain_event para outros stages (NOT_QUALIFIED, IN_DOUBT, etc.)
 * 4. Não insere domain_event em dryRun
 * 5. Publica no Pub/Sub após commit (e não publica em rollback)
 * 6. Faz rollback se INSERT domain_events falhar
 * 7. Upsert application com prescreening.status para status não-ANALYZED (sem domain event)
 */

import { ProcessTalentumPrescreening, IWorkerLookup, IJobPostingLookup } from '../ProcessTalentumPrescreening';
import { TalentumPrescreeningPayloadParsed } from '../../../interfaces/webhooks/validators/talentumPrescreeningSchema';

function buildPayload(overrides: {
  status?: 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ANALYZED';
  statusLabel?: 'QUALIFIED' | 'NOT_QUALIFIED' | 'IN_DOUBT';
  score?: number;
} = {}): TalentumPrescreeningPayloadParsed {
  return {
    prescreening: {
      id: 'tp-1',
      name: 'Case Test',
      status: overrides.status ?? 'ANALYZED',
    },
    profile: {
      id: 'prof-1',
      firstName: 'Juan',
      lastName: 'Perez',
      email: 'juan@test.com',
      phoneNumber: '+5491100001111',
      registerQuestions: [],
    },
    response: {
      id: 'resp-1',
      state: [],
      score: overrides.score ?? 85,
      statusLabel: overrides.statusLabel ?? 'QUALIFIED',
    },
  };
}

describe('ProcessTalentumPrescreening — domain event emission (Step 4)', () => {
  let mockPrescreeningRepo: any;
  let mockWorkerLookup: jest.Mocked<IWorkerLookup>;
  let mockJobPostingLookup: jest.Mocked<IJobPostingLookup>;
  let mockPoolClient: any;
  let mockPool: any;
  let mockPubsub: any;
  let useCase: ProcessTalentumPrescreening;

  beforeEach(() => {
    // Mock prescreening repo — upsertPrescreening passes through workerId/jobPostingId from input
    mockPrescreeningRepo = {
      upsertPrescreening: jest.fn().mockImplementation((dto: any) => Promise.resolve({
        prescreening: {
          id: 'ps-1',
          talentumPrescreeningId: dto.talentumPrescreeningId || 'tp-1',
          workerId: dto.workerId === undefined ? 'w-1' : dto.workerId,
          jobPostingId: dto.jobPostingId === undefined ? 'jp-1' : dto.jobPostingId,
        },
        created: true,
      })),
      upsertWorkerJobApplicationFromTalentum: jest.fn().mockResolvedValue({
        previousStage: null, // default: new application (no previous stage)
      }),
      upsertQuestion: jest.fn().mockResolvedValue({
        question: { id: 'q-1' },
        created: true,
      }),
      upsertResponse: jest.fn().mockResolvedValue({
        response: { id: 'r-1' },
        created: true,
      }),
    };

    // Mock worker lookup — always finds worker
    mockWorkerLookup = {
      findByEmail: jest.fn().mockResolvedValue({ getValue: () => ({ id: 'w-1' }) }),
      findByPhone: jest.fn().mockResolvedValue({ getValue: () => null }),
      findByCuit: jest.fn().mockResolvedValue({ getValue: () => null }),
    };

    // Mock job posting lookup
    mockJobPostingLookup = {
      findByTitleILike: jest.fn().mockResolvedValue({ id: 'jp-1' }),
    };

    // Mock pool client (transaction)
    mockPoolClient = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('domain_events')) {
          return Promise.resolve({ rows: [{ id: 'evt-uuid-123' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockPoolClient),
    };

    // Mock PubSub
    mockPubsub = {
      publish: jest.fn().mockResolvedValue('msg-id-1'),
    };

    useCase = new ProcessTalentumPrescreening(
      mockPrescreeningRepo,
      mockWorkerLookup,
      mockJobPostingLookup,
      mockPool,
      mockPubsub,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── 1. Insere domain_event ao transitar para QUALIFIED ───────────

  it('insere domain_event na transação ao transitar para QUALIFIED', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: 'SCREENED', // transitou de SCREENED → QUALIFIED
    });

    await useCase.execute(payload);

    // Verifica transação: BEGIN, upsert (via repo), INSERT domain_events, COMMIT
    expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');

    // Verifica INSERT em domain_events
    const domainEventCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('domain_events'),
    );
    expect(domainEventCall).toBeDefined();
    expect(domainEventCall[0]).toContain('funnel_stage.qualified');
    expect(domainEventCall[1][0]).toContain('w-1');
    expect(domainEventCall[1][0]).toContain('jp-1');

    // Client released
    expect(mockPoolClient.release).toHaveBeenCalled();
  });

  // ─── 2. Não insere se já era QUALIFIED (deduplicação) ─────────────

  it('não insere domain_event se previousStage já era QUALIFIED', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: 'QUALIFIED', // já era QUALIFIED — sem transição
    });

    await useCase.execute(payload);

    // Não deve ter INSERT em domain_events
    const domainEventCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('domain_events'),
    );
    expect(domainEventCall).toBeUndefined();

    // Pub/Sub não deve ser chamado
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  // ─── 3. NOT_QUALIFIED: auto-rejeição + domain event ────────────────

  it('auto-rejeita encuadre e emite domain_event ao transitar para NOT_QUALIFIED', async () => {
    const payload = buildPayload({ statusLabel: 'NOT_QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: null, // primeira vez → transição
    });

    await useCase.execute(payload);

    // Verifica UPDATE encuadres com RECHAZADO + TALENTUM_NOT_QUALIFIED + WHERE resultado IS NULL
    const updateCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE encuadres'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toContain('RECHAZADO');
    expect(updateCall[0]).toContain('TALENTUM_NOT_QUALIFIED');
    expect(updateCall[0]).toContain('resultado IS NULL');
    expect(updateCall[1]).toEqual(['w-1', 'jp-1']);

    // Verifica INSERT em domain_events com funnel_stage.not_qualified
    const domainEventCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('domain_events'),
    );
    expect(domainEventCall).toBeDefined();
    expect(domainEventCall[0]).toContain('funnel_stage.not_qualified');

    // Tudo na mesma transação
    expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');

    // Pub/Sub após commit
    expect(mockPubsub.publish).toHaveBeenCalledWith('domain-events', {
      eventId: 'evt-uuid-123',
    });
  });

  it('não re-executa auto-rejeição se previousStage já era NOT_QUALIFIED (deduplicação)', async () => {
    const payload = buildPayload({ statusLabel: 'NOT_QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: 'NOT_QUALIFIED', // já era NOT_QUALIFIED — sem transição
    });

    await useCase.execute(payload);

    const updateCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE encuadres'),
    );
    expect(updateCall).toBeUndefined();

    const domainEventCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('domain_events'),
    );
    expect(domainEventCall).toBeUndefined();

    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('faz rollback se UPDATE encuadres falhar no fluxo NOT_QUALIFIED', async () => {
    const payload = buildPayload({ statusLabel: 'NOT_QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: null,
    });

    mockPoolClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve();
      if (sql === 'COMMIT') return Promise.resolve();
      if (sql === 'ROLLBACK') return Promise.resolve();
      if (sql.includes('UPDATE encuadres')) {
        return Promise.reject(new Error('FK violation'));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(useCase.execute(payload)).rejects.toThrow('FK violation');

    expect(mockPoolClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockPubsub.publish).not.toHaveBeenCalled();
    expect(mockPoolClient.release).toHaveBeenCalled();
  });

  // ─── 3b. Não insere para outros stages (IN_DOUBT) ────────────────

  it('não insere domain_event para statusLabel IN_DOUBT', async () => {
    const payload = buildPayload({ statusLabel: 'IN_DOUBT' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: 'SCREENED',
    });

    await useCase.execute(payload);

    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  // ─── 4. Não insere em dryRun ───────────────────────────────────────

  it('não insere domain_event nem faz upsert em dryRun', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });

    const result = await useCase.execute(payload, { dryRun: true });

    expect(result.prescreeningId).toBe('tp-1');
    expect(mockPool.connect).not.toHaveBeenCalled();
    expect(mockPubsub.publish).not.toHaveBeenCalled();
    expect(mockPrescreeningRepo.upsertPrescreening).not.toHaveBeenCalled();
  });

  // ─── 5. Publica no Pub/Sub após commit ─────────────────────────────

  it('publica no Pub/Sub com eventId após commit', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: null, // nova application → transição para QUALIFIED
    });

    await useCase.execute(payload);

    expect(mockPubsub.publish).toHaveBeenCalledWith('domain-events', {
      eventId: 'evt-uuid-123',
    });

    // Pub/Sub publish é chamado APÓS commit
    const commitIndex = mockPoolClient.query.mock.calls.findIndex(
      (call: any[]) => call[0] === 'COMMIT',
    );
    expect(commitIndex).toBeGreaterThan(-1);
    // publish é chamado fora do client.query — verificamos apenas que foi chamado
    expect(mockPubsub.publish).toHaveBeenCalledTimes(1);
  });

  // ─── 6. Rollback se INSERT domain_events falhar ────────────────────

  it('faz rollback se INSERT em domain_events falhar', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: null,
    });

    // Faz o INSERT em domain_events falhar
    mockPoolClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve();
      if (sql === 'COMMIT') return Promise.resolve();
      if (sql === 'ROLLBACK') return Promise.resolve();
      if (sql.includes('domain_events')) {
        return Promise.reject(new Error('DB constraint violation'));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(useCase.execute(payload)).rejects.toThrow('DB constraint violation');

    expect(mockPoolClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockPubsub.publish).not.toHaveBeenCalled();
    expect(mockPoolClient.release).toHaveBeenCalled();
  });

  // ─── 7. Status não-ANALYZED: upsert application com prescreening.status, sem domain event ──

  it('faz upsert em worker_job_applications com status IN_PROGRESS mas não emite domain event', async () => {
    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;

    await useCase.execute(payload);

    // Deve chamar upsert com o status do prescreening como funnel stage
    expect(mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum).toHaveBeenCalledWith(
      expect.objectContaining({ applicationFunnelStage: 'IN_PROGRESS' }),
      mockPoolClient,
    );

    // Não deve emitir domain event (não é QUALIFIED)
    const domainEventCall = mockPoolClient.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('domain_events'),
    );
    expect(domainEventCall).toBeUndefined();
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  // ─── 8. previousStage null = primeira application → transição ──────

  it('trata previousStage null como transição (primeira application)', async () => {
    const payload = buildPayload({ statusLabel: 'QUALIFIED' });
    mockPrescreeningRepo.upsertWorkerJobApplicationFromTalentum.mockResolvedValue({
      previousStage: null, // primeira vez — null !== 'QUALIFIED'
    });

    await useCase.execute(payload);

    // Deve emitir evento
    expect(mockPubsub.publish).toHaveBeenCalledWith('domain-events', {
      eventId: 'evt-uuid-123',
    });
  });

  // ─── 9. upsertQuestions para registerQuestions e response.state ────

  it('faz upsert de registerQuestions e response.state', async () => {
    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;
    payload.profile.registerQuestions = [
      { questionId: 'q1', question: 'Experiência?', answer: 'Sim', responseType: 'text' },
    ];
    payload.response.state = [
      { questionId: 'q2', question: 'Disponibilidade?', answer: 'Manhã' },
    ];

    await useCase.execute(payload);

    // upsertQuestion chamado 2x (1 register + 1 prescreening)
    expect(mockPrescreeningRepo.upsertQuestion).toHaveBeenCalledTimes(2);
    expect(mockPrescreeningRepo.upsertResponse).toHaveBeenCalledTimes(2);

    // Verifica source='register' para registerQuestions
    expect(mockPrescreeningRepo.upsertResponse).toHaveBeenCalledWith(
      expect.objectContaining({ responseSource: 'register' }),
    );
    // Verifica source='prescreening' para response.state
    expect(mockPrescreeningRepo.upsertResponse).toHaveBeenCalledWith(
      expect.objectContaining({ responseSource: 'prescreening' }),
    );
  });

  // ─── 10. resolveWorkerId — fallback phone → cuil ───────────────────

  it('resolve worker por phone quando email não encontra', async () => {
    mockWorkerLookup.findByEmail.mockResolvedValue({ getValue: () => null });
    mockWorkerLookup.findByPhone.mockResolvedValue({ getValue: () => ({ id: 'w-phone' }) });

    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;

    const result = await useCase.execute(payload);
    expect(result.workerId).toBe('w-phone');
  });

  it('resolve worker por cuil quando email e phone não encontram', async () => {
    mockWorkerLookup.findByEmail.mockResolvedValue({ getValue: () => null });
    mockWorkerLookup.findByPhone.mockResolvedValue({ getValue: () => null });
    mockWorkerLookup.findByCuit.mockResolvedValue({ getValue: () => ({ id: 'w-cuil' }) });

    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;
    payload.profile.cuil = '20-12345678-9';

    const result = await useCase.execute(payload);
    expect(result.workerId).toBe('w-cuil');
  });

  it('retorna null se nenhum lookup encontra worker', async () => {
    mockWorkerLookup.findByEmail.mockResolvedValue({ getValue: () => null });
    mockWorkerLookup.findByPhone.mockResolvedValue({ getValue: () => null });

    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;
    // No cuil in payload — skips findByCuit

    const result = await useCase.execute(payload);
    expect(result.workerId).toBeNull();
  });

  // ─── 11. extractId com isSuccess=false ──────────────────────────────

  it('extractId retorna null quando isSuccess=false', async () => {
    mockWorkerLookup.findByEmail.mockResolvedValue({
      isSuccess: false,
      getValue: () => ({ id: 'should-not-use' }),
    });
    mockWorkerLookup.findByPhone.mockResolvedValue({ getValue: () => null });

    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;

    const result = await useCase.execute(payload);
    // Email retornou isSuccess=false, phone retornou null → workerId=null
    expect(result.workerId).toBeNull();
  });

  // ─── 12. resolveJobPostingId retorna null em exceção ───────────────

  it('resolveJobPostingId retorna null quando lookup lança exceção', async () => {
    mockJobPostingLookup.findByTitleILike.mockRejectedValue(new Error('DB error'));

    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;

    const result = await useCase.execute(payload);
    // jobPostingId came from the mock prescreening repo passthrough (null from failed lookup)
    expect(result.jobPostingId).toBeNull();
  });

  // ─── 13. upsertQuestions com responseType vazio ─────────────────────

  it('usa responseType vazio quando não informado', async () => {
    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;
    payload.profile.registerQuestions = [
      { questionId: 'q1', question: 'Test?', answer: 'Yes' }, // no responseType
    ];

    await useCase.execute(payload);

    expect(mockPrescreeningRepo.upsertQuestion).toHaveBeenCalledWith({
      questionId: 'q1',
      question: 'Test?',
      responseType: '', // defaults to ''
    });
  });

  // ─── 14. upsertQuestions com answer vazia ───────────────────────────

  it('passa null para answer vazia', async () => {
    const payload = buildPayload({ status: 'IN_PROGRESS' });
    (payload.response as any).statusLabel = undefined;
    payload.response.state = [
      { questionId: 'q2', question: 'Disponibilidade?', answer: '' }, // empty answer
    ];

    await useCase.execute(payload);

    expect(mockPrescreeningRepo.upsertResponse).toHaveBeenCalledWith(
      expect.objectContaining({ answer: null }),
    );
  });
});
