import { BookSlotFromWhatsAppUseCase } from '../BookSlotFromWhatsAppUseCase';

describe('BookSlotFromWhatsAppUseCase', () => {
  let mockQuery: jest.Mock;
  let mockDb: { query: jest.Mock };
  let mockPubsub: { publish: jest.Mock };
  let mockTokenService: { generate: jest.Mock };
  let mockCloudTasks: { schedule: jest.Mock };
  let mockCalendar: { addGuestToMeeting: jest.Mock };
  let useCase: BookSlotFromWhatsAppUseCase;

  const WORKER = { id: 'w-1', email: 'worker@test.com' };
  const APPLICATION = { id: 'app-1', job_posting_id: 'jp-1' };
  const VACANCY = {
    meet_link_1: 'https://meet.google.com/abc-defg-hij',
    meet_datetime_1: '2026-04-10T14:00:00.000Z',
    meet_link_2: 'https://meet.google.com/klm-nopq-rst',
    meet_datetime_2: '2026-04-11T10:00:00.000Z',
    meet_link_3: null,
    meet_datetime_3: null,
  };

  beforeEach(() => {
    mockQuery = jest.fn();
    mockDb = { query: mockQuery };
    mockPubsub = { publish: jest.fn().mockResolvedValue('msg-1') };
    mockTokenService = { generate: jest.fn().mockResolvedValue('tk_abc123') };
    mockCloudTasks = { schedule: jest.fn().mockResolvedValue('task-123') };
    mockCalendar = { addGuestToMeeting: jest.fn().mockResolvedValue({ success: true }) };

    useCase = new BookSlotFromWhatsAppUseCase(
      mockDb as any,
      mockPubsub as any,
      mockTokenService as any,
      mockCloudTasks as any,
      mockCalendar as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  /** Happy path com OriginalRepliedMessageSid (correlação exata via outbox) */
  function setupHappyPathWithSid() {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })                              // find worker
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })          // outbox lookup by twilio_sid
      .mockResolvedValueOnce({ rows: [VACANCY] })                             // find vacancy
      .mockResolvedValueOnce({ rows: [] })                                    // update WJA
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })                 // insert outbox
    ;
  }

  /** Happy path sem SID (fallback para busca por interview_response) */
  function setupHappyPathFallback() {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })                              // find worker
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })          // fallback WJA pending
      .mockResolvedValueOnce({ rows: [VACANCY] })                             // find vacancy
      .mockResolvedValueOnce({ rows: [] })                                    // update WJA
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })                 // insert outbox
    ;
  }

  // ─── Happy path (com OriginalRepliedMessageSid) ─────────────────

  it('identifica worker pelo phone normalizado', async () => {
    setupHappyPathWithSid();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(result.isSuccess).toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual(['+5491112345678']);
  });

  it('busca job_posting_id via twilio_sid na outbox', async () => {
    setupHappyPathWithSid();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(result.isSuccess).toBe(true);
    // Segunda query: lookup na outbox por twilio_sid
    expect(mockQuery.mock.calls[1][0]).toContain('twilio_sid');
    expect(mockQuery.mock.calls[1][1]).toEqual(['SM-abc123']);
  });

  it('mapeia slot_1 ao meet_link_1 da vaga', async () => {
    setupHappyPathWithSid();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(result.isSuccess).toBe(true);
    const updateCall = mockQuery.mock.calls[3];
    expect(updateCall[1][0]).toBe(VACANCY.meet_link_1);
    expect(updateCall[1][1]).toBe(VACANCY.meet_datetime_1);
  });

  it('mapeia slot_2 ao meet_link_2 da vaga', async () => {
    setupHappyPathWithSid();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_2', 'SM-abc123');

    expect(result.isSuccess).toBe(true);
    const updateCall = mockQuery.mock.calls[3];
    expect(updateCall[1][0]).toBe(VACANCY.meet_link_2);
  });

  it('adiciona worker ao Google Calendar', async () => {
    setupHappyPathWithSid();

    await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(mockCalendar.addGuestToMeeting).toHaveBeenCalledWith(
      VACANCY.meet_link_1,
      WORKER.email,
    );
  });

  it('enfileira confirmação WhatsApp e publica no Pub/Sub', async () => {
    setupHappyPathWithSid();

    await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(mockTokenService.generate).toHaveBeenCalledWith('w-1', 'worker_first_name');

    // INSERT outbox
    const insertCall = mockQuery.mock.calls[4];
    expect(insertCall[0]).toContain('qualified_slot_confirmed');
    expect(insertCall[1][0]).toBe('w-1');

    // Pub/Sub
    expect(mockPubsub.publish).toHaveBeenCalledWith('outbox-enqueued', { outboxId: 'outbox-1' });
  });

  it('agenda 2 Cloud Tasks (24h + 5min antes)', async () => {
    setupHappyPathWithSid();

    await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(mockCloudTasks.schedule).toHaveBeenCalledTimes(2);

    // 24h antes
    const call24h = mockCloudTasks.schedule.mock.calls[0][0];
    expect(call24h.queue).toBe('interview-reminders');
    expect(call24h.url).toBe('/api/internal/reminders/qualified');
    expect(call24h.body).toEqual({ workerId: 'w-1', jobPostingId: 'jp-1' });

    const scheduled24h = new Date(call24h.scheduleTime);
    const interviewTime = new Date(VACANCY.meet_datetime_1!).getTime();
    expect(scheduled24h.getTime()).toBe(interviewTime - 24 * 60 * 60 * 1000);

    // 5min antes
    const call5min = mockCloudTasks.schedule.mock.calls[1][0];
    expect(call5min.url).toBe('/api/internal/reminders/5min');

    const scheduled5min = new Date(call5min.scheduleTime);
    expect(scheduled5min.getTime()).toBe(interviewTime - 5 * 60 * 1000);
  });

  // ─── Fallback (sem OriginalRepliedMessageSid) ──────────────────

  it('usa fallback para WJA pendente se OriginalRepliedMessageSid ausente', async () => {
    setupHappyPathFallback();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1');

    expect(result.isSuccess).toBe(true);
    // Fallback query busca interview_response='pending' AND interview_meet_link IS NULL
    expect(mockQuery.mock.calls[1][0]).toContain('interview_response');
    expect(mockQuery.mock.calls[1][0]).toContain('interview_meet_link IS NULL');
  });

  it('usa fallback se twilio_sid não encontrado na outbox', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })                              // find worker
      .mockResolvedValueOnce({ rows: [] })                                    // outbox lookup: NOT FOUND
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })          // fallback WJA
      .mockResolvedValueOnce({ rows: [VACANCY] })                             // find vacancy
      .mockResolvedValueOnce({ rows: [] })                                    // update WJA
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });                // insert outbox

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-unknown');

    expect(result.isSuccess).toBe(true);
    // Primeira tentativa: outbox por SID (miss)
    expect(mockQuery.mock.calls[1][1]).toEqual(['SM-unknown']);
    // Fallback: WJA pending
    expect(mockQuery.mock.calls[2][0]).toContain('interview_response');
  });

  // ─── Edge cases ────────────────────────────────────────────────

  it('retorna fail se worker not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await useCase.execute('whatsapp:+5491100000000', 'slot_1');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Worker not found');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('retorna fail se não há interview pendente (nem via SID nem via fallback)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })     // find worker
      .mockResolvedValueOnce({ rows: [] });           // fallback WJA: nenhuma pendente

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('No pending interview');
  });

  it('retorna fail para slot inválido (slot_4)', async () => {
    setupHappyPathFallback();

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_4');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Invalid slot index');
  });

  it('retorna fail se meet_link_N é null', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })
      .mockResolvedValueOnce({ rows: [VACANCY] });

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_3', 'SM-abc123');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Invalid slot');
  });

  it('retorna fail se job_posting not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Job posting not found');
  });

  it('não chama addGuestToMeeting se worker não tem email', async () => {
    const workerNoEmail = { id: 'w-1', email: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [workerNoEmail] })
      .mockResolvedValueOnce({ rows: [{ job_posting_id: 'jp-1' }] })
      .mockResolvedValueOnce({ rows: [VACANCY] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });

    const result = await useCase.execute('whatsapp:+5491112345678', 'slot_1', 'SM-abc123');

    expect(result.isSuccess).toBe(true);
    expect(mockCalendar.addGuestToMeeting).not.toHaveBeenCalled();
  });
});
