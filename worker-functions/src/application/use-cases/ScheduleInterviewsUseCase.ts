import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { InterviewSlotRepository } from '@modules/notification/infrastructure/InterviewSlotRepository';
import { InterviewSchedulingService } from '@modules/notification/infrastructure/InterviewSchedulingService';
import {
  CreateInterviewSlotsDTO,
  BookSlotDTO,
  InterviewSlot,
  BookSlotResult,
} from '@modules/notification/domain/InterviewSlot';
import { Result } from '@shared/utils/Result';

export class ScheduleInterviewsUseCase {
  private repository: InterviewSlotRepository;
  private service: InterviewSchedulingService;

  constructor() {
    const db = DatabaseConnection.getInstance().getPool();
    this.repository = new InterviewSlotRepository();
    this.service = new InterviewSchedulingService(this.repository, db);
  }

  async createSlots(dto: CreateInterviewSlotsDTO): Promise<Result<InterviewSlot[]>> {
    if (!dto.jobPostingId) {
      return Result.fail('jobPostingId is required');
    }
    if (!dto.slots || dto.slots.length === 0) {
      return Result.fail('At least one slot is required');
    }
    for (const slot of dto.slots) {
      if (!slot.date || !slot.startTime || !slot.endTime) {
        return Result.fail('Each slot must have date, startTime and endTime');
      }
    }
    try {
      const slots = await this.service.createSlotsForJob(dto);
      return Result.ok(slots);
    } catch (err) {
      return Result.fail(err instanceof Error ? err.message : 'Failed to create slots');
    }
  }

  async bookSlot(dto: BookSlotDTO): Promise<Result<BookSlotResult>> {
    if (!dto.slotId) return Result.fail('slotId is required');
    if (!dto.encuadreId) return Result.fail('encuadreId is required');
    const db = DatabaseConnection.getInstance().getPool();
    return this.service.bookSlot(dto, db);
  }
}
