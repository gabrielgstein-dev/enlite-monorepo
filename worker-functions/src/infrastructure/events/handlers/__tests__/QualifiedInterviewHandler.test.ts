/**
 * QualifiedInterviewHandler.test.ts
 *
 * Testa o handler do evento funnel_stage.qualified.
 *
 * Cenários:
 * 1. Enfileira mensagem qualified_worker com slots, links e case_number
 * 2. Pula envio se vaga não encontrada
 * 3. Pula envio se vaga sem meet links configurados
 * 4. Pula envio se worker não encontrado
 * 5. Publica outbox-enqueued no Pub/Sub após inserir na outbox
 * 6. Marca interview_response = 'pending' na worker_job_applications
 * 7. Funciona com apenas 1 ou 2 meet links (opções parciais)
 * 8. formatSlotOption formata datetime corretamente
 */

import {
  createQualifiedInterviewHandler,
  formatSlotOption,
} from '../QualifiedInterviewHandler';

describe('QualifiedInterviewHandler', () => {
  let mockQuery: jest.Mock;
  let mockDb: { query: jest.Mock };
  let mockPubsub: { publish: jest.Mock };
  let mockTokenService: { generate: jest.Mock };
  let handler: (payload: Record<string, unknown>) => Promise<void>;

  const payload = {
    workerId: 'worker-1',
    jobPostingId: 'job-1',
  };

  const vacancyRow = {
    case_number: 42,
    meet_link_1: 'https://meet.google.com/abc-1',
    meet_datetime_1: '2026-04-07T10:00:00Z',
    meet_link_2: 'https://meet.google.com/abc-2',
    meet_datetime_2: '2026-04-08T15:00:00Z',
    meet_link_3: 'https://meet.google.com/abc-3',
    meet_datetime_3: '2026-04-09T09:00:00Z',
  };

  beforeEach(() => {
    mockQuery = jest.fn();
    mockDb = { query: mockQuery };
    mockPubsub = { publish: jest.fn().mockResolvedValue(null) };
    mockTokenService = { generate: jest.fn().mockResolvedValue('tk_abc123def456') };
    handler = createQualifiedInterviewHandler(
      mockDb as any,
      mockPubsub as any,
      mockTokenService as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('enfileira mensagem qualified_worker com slots, links e case_number', async () => {
    mockQuery
      // 1. SELECT job_posting (case_number + meet links)
      .mockResolvedValueOnce({ rows: [vacancyRow] })
      // 2. SELECT worker
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }] })
      // 3. INSERT outbox
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      // 4. UPDATE worker_job_applications
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    // Verifica INSERT na outbox com template qualified_worker
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('qualified_worker');
    const vars = JSON.parse(insertCall[1][1]);
    expect(vars.slot_1).toBe('Mar 07/04 10:00');
    expect(vars.link_1).toBe('https://meet.google.com/abc-1');
    expect(vars.slot_2).toBe('Mié 08/04 15:00');
    expect(vars.link_2).toBe('https://meet.google.com/abc-2');
    expect(vars.slot_3).toBe('Jue 09/04 09:00');
    expect(vars.link_3).toBe('https://meet.google.com/abc-3');
    expect(vars.case_number).toBe('42');
    expect(vars.job_posting_id).toBe('job-1');
  });

  it('pula envio se vaga não encontrada', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('pula envio se vaga sem meet links configurados (todos null)', async () => {
    const emptyVacancy = {
      case_number: 42,
      meet_link_1: null,
      meet_datetime_1: null,
      meet_link_2: null,
      meet_datetime_2: null,
      meet_link_3: null,
      meet_datetime_3: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [emptyVacancy] });

    await handler(payload);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('pula envio se meet_link_1 existe mas meet_datetime_1 é null', async () => {
    const linkSemDatetime = {
      case_number: 42,
      meet_link_1: 'https://meet.google.com/abc-1',
      meet_datetime_1: null,
      meet_link_2: null,
      meet_datetime_2: null,
      meet_link_3: null,
      meet_datetime_3: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [linkSemDatetime] });

    await handler(payload);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('pula envio se meet_datetime_1 existe mas meet_link_1 é null', async () => {
    const datetimeSemLink = {
      case_number: 42,
      meet_link_1: null,
      meet_datetime_1: '2026-04-07T10:00:00Z',
      meet_link_2: null,
      meet_datetime_2: null,
      meet_link_3: null,
      meet_datetime_3: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [datetimeSemLink] });

    await handler(payload);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('pula envio se worker não encontrado', async () => {
    mockQuery
      // 1. SELECT job_posting — encontra vaga
      .mockResolvedValueOnce({ rows: [vacancyRow] })
      // 2. SELECT worker — não encontra
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('publica outbox-enqueued no Pub/Sub após inserir na outbox', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [vacancyRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-99' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    expect(mockPubsub.publish).toHaveBeenCalledWith('outbox-enqueued', { outboxId: 'outbox-99' });
  });

  it('marca interview_response = pending na worker_job_applications', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [vacancyRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    const updateCall = mockQuery.mock.calls[3];
    expect(updateCall[0]).toContain('interview_response');
    expect(updateCall[0]).toContain('pending');
    expect(updateCall[1]).toEqual(['worker-1', 'job-1']);
  });

  it('funciona com 2 meet links (opção 3 vazia)', async () => {
    const twoLinksVacancy = {
      case_number: 42,
      meet_link_1: 'https://meet.google.com/abc-1',
      meet_datetime_1: '2026-04-07T10:00:00Z',
      meet_link_2: 'https://meet.google.com/abc-2',
      meet_datetime_2: '2026-04-08T15:00:00Z',
      meet_link_3: null,
      meet_datetime_3: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [twoLinksVacancy] })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    const insertCall = mockQuery.mock.calls[2];
    const vars = JSON.parse(insertCall[1][1]);
    expect(vars.slot_1).toBe('Mar 07/04 10:00');
    expect(vars.link_1).toBe('https://meet.google.com/abc-1');
    expect(vars.slot_2).toBe('Mié 08/04 15:00');
    expect(vars.link_2).toBe('https://meet.google.com/abc-2');
    expect(vars.slot_3).toBe('');
    expect(vars.link_3).toBe('');
  });

  it('funciona com apenas 1 meet link (opções 2 e 3 vazias)', async () => {
    const partialVacancy = {
      case_number: 42,
      meet_link_1: 'https://meet.google.com/abc-1',
      meet_datetime_1: '2026-04-07T10:00:00Z',
      meet_link_2: null,
      meet_datetime_2: null,
      meet_link_3: null,
      meet_datetime_3: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [partialVacancy] })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(payload);

    const insertCall = mockQuery.mock.calls[2];
    const vars = JSON.parse(insertCall[1][1]);
    expect(vars.slot_1).toBe('Mar 07/04 10:00');
    expect(vars.link_1).toBe('https://meet.google.com/abc-1');
    expect(vars.slot_2).toBe('');
    expect(vars.link_2).toBe('');
    expect(vars.slot_3).toBe('');
    expect(vars.link_3).toBe('');
  });

  describe('formatSlotOption', () => {
    it('formata datetime ISO para "Dia DD/MM HH:MM"', () => {
      expect(formatSlotOption('2026-04-07T10:00:00Z')).toBe('Mar 07/04 10:00');
    });

    it('formata horário com minutos', () => {
      expect(formatSlotOption('2026-04-08T15:30:00Z')).toBe('Mié 08/04 15:30');
    });

    it('aceita objeto Date', () => {
      const date = new Date('2026-04-09T09:00:00Z');
      expect(formatSlotOption(date)).toBe('Jue 09/04 09:00');
    });

    it('formata sábado e domingo corretamente', () => {
      expect(formatSlotOption('2026-04-11T14:00:00Z')).toBe('Sáb 11/04 14:00');
      expect(formatSlotOption('2026-04-12T08:00:00Z')).toBe('Dom 12/04 08:00');
    });
  });
});
