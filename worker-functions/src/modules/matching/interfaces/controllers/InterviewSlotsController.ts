import { Request, Response } from 'express';
import { ScheduleInterviewsUseCase } from '../../application/ScheduleInterviewsUseCase';
import { InterviewSlotRepository } from '@modules/notification/infrastructure/InterviewSlotRepository';

/**
 * InterviewSlotsController
 *
 * Endpoints para gerenciamento de slots de entrevista (Wave 2).
 *
 * - POST /api/admin/vacancies/:id/interview-slots   — cria slots para uma vaga
 * - GET  /api/admin/vacancies/:id/interview-slots   — lista slots de uma vaga
 * - POST /api/admin/interview-slots/:slotId/book    — reserva slot para encuadre
 * - DELETE /api/admin/interview-slots/:slotId       — cancela slot
 */
export class InterviewSlotsController {
  private useCase: ScheduleInterviewsUseCase;
  private repository: InterviewSlotRepository;

  constructor() {
    this.useCase = new ScheduleInterviewsUseCase();
    this.repository = new InterviewSlotRepository();
  }

  async createSlots(req: Request, res: Response): Promise<void> {
    try {
      const { id: jobPostingId } = req.params;
      const { coordinatorId, meetLink, notes, slots } = req.body;

      if (!slots || !Array.isArray(slots) || slots.length === 0) {
        res.status(400).json({
          success: false,
          error: 'slots array is required and must not be empty',
        });
        return;
      }

      const result = await this.useCase.createSlots({
        jobPostingId,
        coordinatorId: coordinatorId ?? null,
        meetLink:      meetLink ?? null,
        notes:         notes ?? null,
        slots,
      });

      if (result.isFailure) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.status(201).json({ success: true, data: result.getValue() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[InterviewSlotsController] createSlots error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  async getSlots(req: Request, res: Response): Promise<void> {
    try {
      const { id: jobPostingId } = req.params;
      const { status } = req.query as { status?: string };

      const slots = status === 'AVAILABLE'
        ? await this.repository.getAvailableSlots(jobPostingId)
        : await this.repository.getAllSlots(jobPostingId);

      const summary = {
        total:     slots.length,
        available: slots.filter(s => s.status === 'AVAILABLE').length,
        full:      slots.filter(s => s.status === 'FULL').length,
        cancelled: slots.filter(s => s.status === 'CANCELLED').length,
      };

      res.json({ success: true, data: { jobPostingId, slots, summary } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[InterviewSlotsController] getSlots error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  async bookSlot(req: Request, res: Response): Promise<void> {
    try {
      const { slotId } = req.params;
      const { encuadreId, sendInvitation } = req.body;

      if (!encuadreId) {
        res.status(400).json({ success: false, error: 'encuadreId is required' });
        return;
      }

      const result = await this.useCase.bookSlot({
        slotId,
        encuadreId,
        sendInvitation: sendInvitation !== false,
      });

      if (result.isFailure) {
        const status = result.error?.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true, data: result.getValue() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[InterviewSlotsController] bookSlot error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }

  async cancelSlot(req: Request, res: Response): Promise<void> {
    try {
      const { slotId } = req.params;
      const cancelled = await this.repository.cancelSlot(slotId);

      if (!cancelled) {
        res.status(404).json({ success: false, error: 'Slot not found' });
        return;
      }

      res.json({ success: true, data: { slotId, status: 'CANCELLED' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[InterviewSlotsController] cancelSlot error:', message);
      res.status(500).json({ success: false, error: message });
    }
  }
}
