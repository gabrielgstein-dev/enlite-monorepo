/**
 * ReminderScheduler.test.ts
 *
 * Testa o scheduler de lembretes event-driven (Cloud Tasks).
 *
 * Cenários:
 * 1. scheduleReminders() agenda 2 Cloud Tasks com scheduleTime correto
 * 2. scheduleReminders() calcula 24h e 5min antes corretamente
 * 3. cancelReminders() deleta Cloud Tasks agendados
 * 4. processQualifiedReminder() insere na outbox e marca reminder_day_sent_at
 * 5. processQualifiedReminder() retorna silenciosamente se não há encuadre pendente
 * 6. process5MinReminder() insere na outbox e marca reminder_5min_sent_at
 * 7. process5MinReminder() retorna silenciosamente se não há encuadre pendente
 * 8. processBatch() safety net — processa 24h e 5min em batch
 * 9. API: não expõe start()/stop()
 */

import { ReminderScheduler } from '../ReminderScheduler';

describe('ReminderScheduler', () => {
  let mockQuery: jest.Mock;
  let mockDb: { query: jest.Mock };
  let mockCloudTasks: { schedule: jest.Mock; deleteTask: jest.Mock };
  let scheduler: ReminderScheduler;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockDb = { query: mockQuery };
    mockCloudTasks = {
      schedule: jest.fn().mockResolvedValue('task-name-123'),
      deleteTask: jest.fn().mockResolvedValue(undefined),
    };
    scheduler = new ReminderScheduler(mockDb as any, mockCloudTasks as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── scheduleReminders ───────────────────────────────────────────

  describe('scheduleReminders', () => {
    it('agenda 2 Cloud Tasks (24h e 5min antes)', async () => {
      const slotDatetime = '2026-04-10T14:00:00.000Z';

      const { taskNames } = await scheduler.scheduleReminders(slotDatetime, 'w-1', 'jp-1');

      expect(mockCloudTasks.schedule).toHaveBeenCalledTimes(2);
      expect(taskNames).toEqual(['task-name-123', 'task-name-123']);

      // 24h antes
      const call24h = mockCloudTasks.schedule.mock.calls[0][0];
      expect(call24h.queue).toBe('interview-reminders');
      expect(call24h.url).toBe('/api/internal/reminders/qualified');
      expect(call24h.body).toEqual({ workerId: 'w-1', jobPostingId: 'jp-1' });

      // 5min antes
      const call5min = mockCloudTasks.schedule.mock.calls[1][0];
      expect(call5min.url).toBe('/api/internal/reminders/5min');
      expect(call5min.body).toEqual({ workerId: 'w-1', jobPostingId: 'jp-1' });
    });

    it('calcula scheduleTime corretamente (24h e 5min antes)', async () => {
      const slotDatetime = '2026-04-10T14:00:00.000Z';
      const slotMs = new Date(slotDatetime).getTime();

      await scheduler.scheduleReminders(slotDatetime, 'w-1', 'jp-1');

      const scheduled24h = new Date(mockCloudTasks.schedule.mock.calls[0][0].scheduleTime);
      const scheduled5min = new Date(mockCloudTasks.schedule.mock.calls[1][0].scheduleTime);

      expect(scheduled24h.getTime()).toBe(slotMs - 24 * 60 * 60 * 1000);
      expect(scheduled5min.getTime()).toBe(slotMs - 5 * 60 * 1000);
    });

    it('retorna taskNames vazios se cloudTasks retorna null (mock mode)', async () => {
      mockCloudTasks.schedule.mockResolvedValue(null);

      const { taskNames } = await scheduler.scheduleReminders('2026-04-10T14:00:00.000Z', 'w-1', 'jp-1');

      expect(taskNames).toEqual([]);
    });
  });

  // ─── cancelReminders ─────────────────────────────────────────────

  describe('cancelReminders', () => {
    it('deleta todos os Cloud Tasks informados', async () => {
      await scheduler.cancelReminders(['task-a', 'task-b']);

      expect(mockCloudTasks.deleteTask).toHaveBeenCalledTimes(2);
      expect(mockCloudTasks.deleteTask).toHaveBeenCalledWith('task-a');
      expect(mockCloudTasks.deleteTask).toHaveBeenCalledWith('task-b');
    });

    it('não falha com lista vazia', async () => {
      await scheduler.cancelReminders([]);

      expect(mockCloudTasks.deleteTask).not.toHaveBeenCalled();
    });
  });

  // ─── processQualifiedReminder (dispatch: WJA → encuadre) ────────

  describe('processQualifiedReminder', () => {
    it('usa fluxo WJA quando encontra worker_job_application confirmed', async () => {
      const wjaRow = {
        interview_response: 'confirmed',
        interview_reminder_sent_at: null,
        interview_datetime: '2026-04-10T14:00:00.000Z',
        interview_meet_link: 'https://meet.google.com/abc',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [wjaRow] })            // SELECT WJA
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })// INSERT outbox
        .mockResolvedValueOnce({ rows: [] });                  // UPDATE WJA

      await scheduler.processQualifiedReminder('w-1', 'jp-1');

      // Deve usar template qualified_reminder_confirm (não encuadre_reminder_day_before)
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('qualified_reminder_confirm');
    });

    it('cai no fallback encuadre quando WJA não encontrada', async () => {
      const encuadreRow = {
        encuadre_id: 'enc-001',
        worker_id: 'w-1',
        slot_date: '2026-04-10',
        slot_time: '14:00:00',
        meet_link: 'https://meet.google.com/abc',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })             // SELECT WJA — vazio
        .mockResolvedValueOnce({ rows: [encuadreRow] })  // SELECT encuadre
        .mockResolvedValueOnce({ rows: [] })              // INSERT outbox
        .mockResolvedValueOnce({ rows: [] });             // UPDATE encuadre

      await scheduler.processQualifiedReminder('w-1', 'jp-1');

      const insertCall = mockQuery.mock.calls[2];
      expect(insertCall[0]).toContain('encuadre_reminder_day_before');
    });

    it('encuadre fallback trata slot_time e meet_link nulos', async () => {
      const encuadreRow = {
        encuadre_id: 'enc-002',
        worker_id: 'w-2',
        slot_date: '2026-04-10',
        slot_time: null,
        meet_link: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })               // SELECT WJA — vazio
        .mockResolvedValueOnce({ rows: [encuadreRow] })    // SELECT encuadre
        .mockResolvedValueOnce({ rows: [] })                // INSERT outbox
        .mockResolvedValueOnce({ rows: [] });               // UPDATE encuadre

      await scheduler.processQualifiedReminder('w-2', 'jp-2');

      const insertCall = mockQuery.mock.calls[2];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.time).toBe('');
      expect(variables.meet_link).toBe('');
    });

    it('retorna silenciosamente se nem WJA nem encuadre encontrados', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })   // SELECT WJA — vazio
        .mockResolvedValueOnce({ rows: [] });  // SELECT encuadre — vazio

      await scheduler.processQualifiedReminder('w-nonexistent', 'jp-1');

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ─── processQualifiedInterviewReminder (WJA flow) ──────────────

  describe('processQualifiedInterviewReminder', () => {
    let schedulerWithPubsub: ReminderScheduler;
    let mockPubsub: { publish: jest.Mock };
    let mockTokenService: { generate: jest.Mock };

    beforeEach(() => {
      mockPubsub = { publish: jest.fn().mockResolvedValue('msg-1') };
      mockTokenService = { generate: jest.fn().mockResolvedValue('tk_abc') };
      schedulerWithPubsub = new ReminderScheduler(
        mockDb as any,
        mockCloudTasks as any,
        mockPubsub as any,
        mockTokenService as any,
      );
    });

    it('envia reminder interativo e marca interview_reminder_sent_at', async () => {
      const wjaRow = {
        interview_response: 'confirmed',
        interview_reminder_sent_at: null,
        interview_datetime: '2026-04-10T14:00:00.000Z',
        interview_meet_link: 'https://meet.google.com/abc',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [wjaRow] })            // SELECT WJA
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })// INSERT outbox
        .mockResolvedValueOnce({ rows: [] });                  // UPDATE WJA

      const handled = await schedulerWithPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(true);

      // Token service chamado
      expect(mockTokenService.generate).toHaveBeenCalledWith('w-1', 'worker_first_name');

      // Outbox com template correto
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('qualified_reminder_confirm');
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.name).toBe('tk_abc');
      expect(variables.date).toBe('10/04');
      expect(variables.time).toBe('14:00');

      // Pub/Sub publicado
      expect(mockPubsub.publish).toHaveBeenCalledWith('outbox-enqueued', { outboxId: 'outbox-1' });

      // Marcou reminder_sent_at
      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain('interview_reminder_sent_at');
      expect(updateCall[1]).toEqual(['w-1', 'jp-1']);
    });

    it('retorna true e pula se já enviou (idempotência)', async () => {
      const wjaRow = {
        interview_response: 'confirmed',
        interview_reminder_sent_at: '2026-04-09T10:00:00.000Z',
        interview_datetime: '2026-04-10T14:00:00.000Z',
      };

      mockQuery.mockResolvedValueOnce({ rows: [wjaRow] });

      const handled = await schedulerWithPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1); // Só o SELECT
    });

    it('retorna true e pula se worker já declinou (idempotência)', async () => {
      const wjaRow = {
        interview_response: 'declined',
        interview_reminder_sent_at: null,
        interview_datetime: '2026-04-10T14:00:00.000Z',
      };

      mockQuery.mockResolvedValueOnce({ rows: [wjaRow] });

      const handled = await schedulerWithPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('retorna true e pula se interview_datetime é null', async () => {
      const wjaRow = {
        interview_response: 'confirmed',
        interview_reminder_sent_at: null,
        interview_datetime: null,
      };

      mockQuery.mockResolvedValueOnce({ rows: [wjaRow] });

      const handled = await schedulerWithPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('retorna false se WJA não encontrada', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const handled = await schedulerWithPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(false);
    });

    it('funciona sem pubsub/tokenService (backward compatibility)', async () => {
      const schedulerNoPubsub = new ReminderScheduler(mockDb as any, mockCloudTasks as any);
      const wjaRow = {
        interview_response: 'confirmed',
        interview_reminder_sent_at: null,
        interview_datetime: '2026-04-10T14:00:00.000Z',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [wjaRow] })
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const handled = await schedulerNoPubsub.processQualifiedInterviewReminder('w-1', 'jp-1');

      expect(handled).toBe(true);
      // Sem pubsub, não publica
      expect(mockPubsub.publish).not.toHaveBeenCalled();
      // name usa workerId como fallback
      const insertCall = mockQuery.mock.calls[1];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.name).toBe('w-1');
    });
  });

  // ─── process5MinReminder ─────────────────────────────────────────

  describe('process5MinReminder', () => {
    it('insere na outbox e marca reminder_5min_sent_at', async () => {
      const fakeRow = {
        encuadre_id: 'enc-002',
        worker_id: 'w-2',
        slot_date: '2026-04-10',
        slot_time: '14:00:00',
        meet_link: 'https://meet.google.com/xyz',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [fakeRow] })  // SELECT encuadre
        .mockResolvedValueOnce({ rows: [] })          // INSERT outbox
        .mockResolvedValueOnce({ rows: [] });         // UPDATE reminder_5min_sent_at

      await scheduler.process5MinReminder('w-2', 'jp-2');

      expect(mockQuery).toHaveBeenCalledTimes(3);

      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('messaging_outbox');
      expect(insertCall[0]).toContain('encuadre_reminder_5min');
      expect(insertCall[1][0]).toBe('w-2');

      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain('reminder_5min_sent_at');
      expect(updateCall[1][0]).toBe('enc-002');
    });

    it('retorna silenciosamente se não há encuadre pendente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await scheduler.process5MinReminder('w-nonexistent', 'jp-1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('trata meet_link nulo com fallback para string vazia', async () => {
      const fakeRow = {
        encuadre_id: 'enc-005',
        worker_id: 'w-5',
        slot_date: '2026-04-10',
        slot_time: '14:00:00',
        meet_link: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [fakeRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await scheduler.process5MinReminder('w-5', 'jp-5');

      const insertCall = mockQuery.mock.calls[1];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.meet_link).toBe('');
    });
  });

  // ─── processBatch (safety net) ───────────────────────────────────

  describe('processBatch', () => {
    it('não insere na outbox quando não há encuadres pendentes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })  // sendDayBeforeReminders
        .mockResolvedValueOnce({ rows: [] }); // send5MinReminders

      await scheduler.processBatch();

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('envia lembrete 5min e marca reminder_5min_sent_at (safety net)', async () => {
      const fakeRow = {
        encuadre_id: 'enc-004',
        worker_id: 'worker-004',
        slot_date: '2026-04-01',
        slot_time: '10:00:00',
        meet_link: 'https://meet.google.com/xyz',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })          // sendDayBeforeReminders SELECT — empty
        .mockResolvedValueOnce({ rows: [fakeRow] })   // send5MinReminders SELECT
        .mockResolvedValueOnce({ rows: [] })           // INSERT outbox
        .mockResolvedValueOnce({ rows: [] });          // UPDATE encuadre

      await scheduler.processBatch();

      expect(mockQuery).toHaveBeenCalledTimes(4);
      const insertCall = mockQuery.mock.calls[2];
      expect(insertCall[0]).toContain('encuadre_reminder_5min');
      expect(insertCall[1][0]).toBe('worker-004');
    });

    it('envia lembrete 5min com meet_link nulo (safety net)', async () => {
      const fakeRow = {
        encuadre_id: 'enc-006',
        worker_id: 'worker-006',
        slot_date: '2026-04-01',
        slot_time: '10:00:00',
        meet_link: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })          // sendDayBeforeReminders — empty
        .mockResolvedValueOnce({ rows: [fakeRow] })   // send5MinReminders
        .mockResolvedValueOnce({ rows: [] })           // INSERT outbox
        .mockResolvedValueOnce({ rows: [] });          // UPDATE encuadre

      await scheduler.processBatch();

      const insertCall = mockQuery.mock.calls[2];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.meet_link).toBe('');
    });

    it('envia lembrete 24h com slot_time/meet_link nulos (safety net)', async () => {
      const fakeRow = {
        encuadre_id: 'enc-007',
        worker_id: 'worker-007',
        slot_date: '2026-04-01',
        slot_time: null,
        meet_link: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [fakeRow] })  // sendDayBeforeReminders
        .mockResolvedValueOnce({ rows: [] })          // INSERT outbox
        .mockResolvedValueOnce({ rows: [] })          // UPDATE encuadre
        .mockResolvedValueOnce({ rows: [] });         // send5MinReminders

      await scheduler.processBatch();

      const insertCall = mockQuery.mock.calls[1];
      const variables = JSON.parse(insertCall[1][1]);
      expect(variables.time).toBe('');
      expect(variables.meet_link).toBe('');
    });

    it('envia lembrete 24h e marca reminder_day_sent_at (safety net)', async () => {
      const fakeRow = {
        encuadre_id: 'enc-003',
        worker_id: 'worker-003',
        slot_date: '2026-04-01',
        slot_time: '10:00:00',
        meet_link: 'https://meet.google.com/abc',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [fakeRow] })  // sendDayBeforeReminders SELECT
        .mockResolvedValueOnce({ rows: [] })          // INSERT outbox
        .mockResolvedValueOnce({ rows: [] })          // UPDATE encuadre
        .mockResolvedValueOnce({ rows: [] });         // send5MinReminders SELECT

      await scheduler.processBatch();

      expect(mockQuery).toHaveBeenCalledTimes(4);
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('encuadre_reminder_day_before');
    });
  });

  // ─── API surface ─────────────────────────────────────────────────

  describe('API surface', () => {
    it('não expõe start() nem stop()', () => {
      expect((scheduler as any).start).toBeUndefined();
      expect((scheduler as any).stop).toBeUndefined();
      expect((scheduler as any).timer).toBeUndefined();
    });
  });
});
