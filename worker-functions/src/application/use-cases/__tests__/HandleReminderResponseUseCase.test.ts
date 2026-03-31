import { HandleReminderResponseUseCase } from '../HandleReminderResponseUseCase';

describe('HandleReminderResponseUseCase', () => {
  let mockQuery: jest.Mock;
  let mockDb: { query: jest.Mock };
  let mockPubsub: { publish: jest.Mock };
  let mockTokenService: { generate: jest.Mock };
  let mockCalendar: { removeGuestFromMeeting: jest.Mock };
  let useCase: HandleReminderResponseUseCase;

  const WORKER = { id: 'w-1', email: 'worker@test.com' };
  const PENDING_APP = {
    id: 'app-1',
    job_posting_id: 'jp-1',
    interview_response: 'pending',
    interview_meet_link: 'https://meet.google.com/abc-defg-hij',
    interview_datetime: '2026-04-10T14:00:00.000Z',
    interview_slot_id: 'slot-1',
  };

  beforeEach(() => {
    mockQuery = jest.fn();
    mockDb = { query: mockQuery };
    mockPubsub = { publish: jest.fn().mockResolvedValue('msg-1') };
    mockTokenService = { generate: jest.fn().mockResolvedValue('tk_abc123') };
    mockCalendar = { removeGuestFromMeeting: jest.fn().mockResolvedValue({ success: true }) };

    useCase = new HandleReminderResponseUseCase(
      mockDb as any,
      mockPubsub as any,
      mockTokenService as any,
      mockCalendar as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── confirm_yes ───────────────────────────────────────────────

  describe('confirm_yes', () => {
    it('marca interview_response = confirmed', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })       // find worker
        .mockResolvedValueOnce({ rows: [PENDING_APP] })   // find application
        .mockResolvedValueOnce({ rows: [] });             // update WJA

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_yes');

      expect(result.isSuccess).toBe(true);

      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain("interview_response    = 'confirmed'");
      expect(updateCall[1]).toEqual(['w-1', 'jp-1']);
    });

    it('retorna fail se transição inválida (confirmed → confirmed)', async () => {
      const confirmedApp = { ...PENDING_APP, interview_response: 'confirmed' };
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })
        .mockResolvedValueOnce({ rows: [confirmedApp] });

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_yes');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Invalid transition');
    });
  });

  // ─── confirm_no (declínio completo) ─────────────────────────────

  describe('confirm_no', () => {
    it('executa fluxo completo de declínio', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })                   // find worker
        .mockResolvedValueOnce({ rows: [PENDING_APP] })               // find application
        .mockResolvedValueOnce({ rows: [] })                          // release slot
        .mockResolvedValueOnce({ rows: [] })                          // update WJA (declined)
        .mockResolvedValueOnce({ rows: [{ title: 'AT Buenos Aires' }] }) // vacancy title
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });      // insert outbox

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isSuccess).toBe(true);

      // Libera slot
      expect(mockQuery.mock.calls[2][0]).toContain('interview_slots');
      expect(mockQuery.mock.calls[2][1]).toEqual(['slot-1']);

      // Remove do Calendar
      expect(mockCalendar.removeGuestFromMeeting).toHaveBeenCalledWith(
        PENDING_APP.interview_meet_link,
        WORKER.email,
      );

      // Atualiza WJA com declined
      expect(mockQuery.mock.calls[3][0]).toContain("interview_response     = 'declined'");

      // Notifica admin
      expect(mockTokenService.generate).toHaveBeenCalledWith('w-1', 'worker_first_name');
      expect(mockQuery.mock.calls[5][0]).toContain('qualified_declined_admin');
      expect(mockPubsub.publish).toHaveBeenCalledWith('outbox-enqueued', { outboxId: 'outbox-1' });
    });

    it('não libera slot se interview_slot_id é null', async () => {
      const appNoSlot = { ...PENDING_APP, interview_slot_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })
        .mockResolvedValueOnce({ rows: [appNoSlot] })
        .mockResolvedValueOnce({ rows: [] })                          // update WJA
        .mockResolvedValueOnce({ rows: [{ title: 'AT BsAs' }] })     // vacancy
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-2' }] });      // outbox

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isSuccess).toBe(true);
      // Não fez query de interview_slots
      expect(mockQuery.mock.calls[2][0]).toContain("interview_response     = 'declined'");
    });

    it('não remove do Calendar se worker não tem email', async () => {
      const workerNoEmail = { id: 'w-1', email: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [workerNoEmail] })
        .mockResolvedValueOnce({ rows: [PENDING_APP] })
        .mockResolvedValueOnce({ rows: [] })                          // release slot
        .mockResolvedValueOnce({ rows: [] })                          // update WJA
        .mockResolvedValueOnce({ rows: [{ title: 'AT BsAs' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-3' }] });

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isSuccess).toBe(true);
      expect(mockCalendar.removeGuestFromMeeting).not.toHaveBeenCalled();
    });

    it('retorna fail se transição inválida (declined → declined)', async () => {
      const declinedApp = { ...PENDING_APP, interview_response: 'declined' };
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })
        .mockResolvedValueOnce({ rows: [declinedApp] });

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Invalid transition');
    });

    it('usa string vazia para date/time se interview_datetime é null', async () => {
      const appNoDatetime = { ...PENDING_APP, interview_datetime: null, interview_slot_id: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })
        .mockResolvedValueOnce({ rows: [appNoDatetime] })
        .mockResolvedValueOnce({ rows: [] })                          // update WJA
        .mockResolvedValueOnce({ rows: [{ title: 'AT BsAs' }] })     // vacancy
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-4' }] });      // outbox

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isSuccess).toBe(true);
      // Verifica que variables inclui date/time vazios
      const insertCall = mockQuery.mock.calls[4];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.date).toBe('');
      expect(variables.time).toBe('');
    });

    it('usa N/A se vacancy title não encontrado', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [WORKER] })
        .mockResolvedValueOnce({ rows: [PENDING_APP] })
        .mockResolvedValueOnce({ rows: [] })                          // release slot
        .mockResolvedValueOnce({ rows: [] })                          // update WJA
        .mockResolvedValueOnce({ rows: [] })                          // vacancy NOT FOUND
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-5' }] });      // outbox

      const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_no');

      expect(result.isSuccess).toBe(true);
      const insertCall = mockQuery.mock.calls[5];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.vacancy_name).toBe('N/A');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────

  it('retorna fail se worker not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await useCase.execute('whatsapp:+5491100000000', 'confirm_yes');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Worker not found');
  });

  it('retorna fail se não há interview pendente', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_yes');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('No pending interview');
  });

  it('retorna fail para button payload desconhecido', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [WORKER] })
      .mockResolvedValueOnce({ rows: [PENDING_APP] });

    const result = await useCase.execute('whatsapp:+5491112345678', 'confirm_maybe');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Unknown button payload');
  });
});
