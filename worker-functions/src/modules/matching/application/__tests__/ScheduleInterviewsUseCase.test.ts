/**
 * ScheduleInterviewsUseCase.test.ts
 *
 * Testa as validações do use case de agendamento de entrevistas (Wave 2).
 *
 * Cenários:
 * 1. Retorna erro se jobPostingId ausente
 * 2. Retorna erro se slots array vazio
 * 3. Retorna erro se slot sem date/startTime/endTime
 * 4. Cria slots com sucesso (mock repository/service)
 * 5. bookSlot retorna erro se slotId ausente
 * 6. bookSlot retorna erro se encuadreId ausente
 */

const mockQuery = jest.fn();

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: mockQuery,
      }),
    }),
  },
}));

// Mock do InterviewSlotRepository para isolar o use case
jest.mock('@modules/notification/infrastructure/InterviewSlotRepository', () => ({
  InterviewSlotRepository: jest.fn().mockImplementation(() => ({
    createSlots: jest.fn(),
    getSlotById: jest.fn(),
    bookSlot:    jest.fn(),
    getAvailableSlots: jest.fn(),
    getAllSlots: jest.fn(),
    cancelSlot:  jest.fn(),
    mapRow:      jest.fn(),
  })),
}));

// Mock do InterviewSchedulingService para isolar o use case
jest.mock('@modules/notification/infrastructure/InterviewSchedulingService', () => ({
  InterviewSchedulingService: jest.fn().mockImplementation(() => ({
    createSlotsForJob: jest.fn(),
    bookSlot:          jest.fn(),
  })),
}));

import { ScheduleInterviewsUseCase } from '../ScheduleInterviewsUseCase';
import { InterviewSchedulingService } from '@modules/notification/infrastructure/InterviewSchedulingService';

describe('ScheduleInterviewsUseCase', () => {
  let useCase: ScheduleInterviewsUseCase;
  let mockServiceInstance: { createSlotsForJob: jest.Mock; bookSlot: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // Cria instância do mock antes do use case para capturar a referência certa
    mockServiceInstance = {
      createSlotsForJob: jest.fn(),
      bookSlot:          jest.fn(),
    };
    (InterviewSchedulingService as jest.Mock).mockImplementation(() => mockServiceInstance);
    useCase = new ScheduleInterviewsUseCase();
  });

  // ─── createSlots ───────────────────────────────────────────────────────────

  it('retorna erro se jobPostingId ausente', async () => {
    const result = await useCase.createSlots({
      jobPostingId: '',
      slots: [{ date: '2026-04-01', startTime: '10:00', endTime: '10:30' }],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('jobPostingId is required');
  });

  it('retorna erro se slots array vazio', async () => {
    const result = await useCase.createSlots({
      jobPostingId: 'jp-001',
      slots: [],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('At least one slot is required');
  });

  it('retorna erro se slot sem date', async () => {
    const result = await useCase.createSlots({
      jobPostingId: 'jp-001',
      slots: [{ date: '', startTime: '10:00', endTime: '10:30' }],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Each slot must have date, startTime and endTime');
  });

  it('retorna erro se slot sem startTime', async () => {
    const result = await useCase.createSlots({
      jobPostingId: 'jp-001',
      slots: [{ date: '2026-04-01', startTime: '', endTime: '10:30' }],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Each slot must have date, startTime and endTime');
  });

  it('cria slots com sucesso quando service retorna resultado válido', async () => {
    const fakeSlots = [
      {
        id: 'slot-001',
        jobPostingId: 'jp-001',
        coordinatorId: null,
        slotDate: '2026-04-01',
        slotTime: '10:00',
        slotEndTime: '10:30',
        meetLink: 'https://meet.google.com/abc',
        maxCapacity: 1,
        bookedCount: 0,
        status: 'AVAILABLE' as const,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockServiceInstance.createSlotsForJob.mockResolvedValueOnce(fakeSlots);

    const result = await useCase.createSlots({
      jobPostingId: 'jp-001',
      slots: [{ date: '2026-04-01', startTime: '10:00', endTime: '10:30' }],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toHaveLength(1);
    expect(result.getValue()[0].id).toBe('slot-001');
    expect(mockServiceInstance.createSlotsForJob).toHaveBeenCalledTimes(1);
  });

  // ─── bookSlot ──────────────────────────────────────────────────────────────

  it('bookSlot retorna erro se slotId ausente', async () => {
    const result = await useCase.bookSlot({
      slotId: '',
      encuadreId: 'enc-001',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('slotId is required');
  });

  it('bookSlot retorna erro se encuadreId ausente', async () => {
    const result = await useCase.bookSlot({
      slotId: 'slot-001',
      encuadreId: '',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('encuadreId is required');
  });
});
