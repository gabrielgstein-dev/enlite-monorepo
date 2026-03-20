import { Request, Response } from 'express';
import { InitWorkerUseCase } from '../../application/use-cases/InitWorkerUseCase';
import { SaveQuizResponsesUseCase } from '../../application/use-cases/SaveQuizResponsesUseCase';
import { SavePersonalInfoUseCase } from '../../application/use-cases/SavePersonalInfoUseCase';
import { SaveServiceAreaUseCase } from '../../application/use-cases/SaveServiceAreaUseCase';
import { SaveAvailabilityUseCase } from '../../application/use-cases/SaveAvailabilityUseCase';
import { GetWorkerProgressUseCase } from '../../application/use-cases/GetWorkerProgressUseCase';
import { WorkerRepository } from '../../infrastructure/repositories/WorkerRepository';
import { QuizResponseRepository } from '../../infrastructure/repositories/QuizResponseRepository';
import { ServiceAreaRepository } from '../../infrastructure/repositories/ServiceAreaRepository';
import { AvailabilityRepository } from '../../infrastructure/repositories/AvailabilityRepository';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class WorkerControllerV2 {
  private initWorkerUseCase: InitWorkerUseCase;
  private saveQuizUseCase: SaveQuizResponsesUseCase;
  private savePersonalInfoUseCase: SavePersonalInfoUseCase;
  private saveServiceAreaUseCase: SaveServiceAreaUseCase;
  private saveAvailabilityUseCase: SaveAvailabilityUseCase;
  private getProgressUseCase: GetWorkerProgressUseCase;

  constructor() {
    const workerRepository = new WorkerRepository();
    const quizRepository = new QuizResponseRepository();
    const serviceAreaRepository = new ServiceAreaRepository();
    const availabilityRepository = new AvailabilityRepository();
    const eventDispatcher = new EventDispatcher();

    this.initWorkerUseCase = new InitWorkerUseCase(workerRepository, eventDispatcher);
    this.saveQuizUseCase = new SaveQuizResponsesUseCase(workerRepository, quizRepository, eventDispatcher);
    this.savePersonalInfoUseCase = new SavePersonalInfoUseCase(workerRepository);
    this.saveServiceAreaUseCase = new SaveServiceAreaUseCase(workerRepository, serviceAreaRepository);
    this.saveAvailabilityUseCase = new SaveAvailabilityUseCase(workerRepository, availabilityRepository);
    this.getProgressUseCase = new GetWorkerProgressUseCase(workerRepository);
  }

  async initWorker(req: Request, res: Response): Promise<void> {
    try {
      const { authUid, email, phone, whatsappPhone, lgpdOptIn, country } = req.body;

      if (!authUid || !email) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: authUid, email',
        });
        return;
      }

      // Check if worker already exists — if so, return existing record
      const existingResult = await this.getProgressUseCase.execute(authUid);
      if (!existingResult.isFailure) {
        res.status(200).json({
          success: true,
          data: existingResult.getValue(),
        });
        return;
      }

      const result = await this.initWorkerUseCase.execute({
        authUid,
        email,
        phone: phone || undefined,
        whatsappPhone: whatsappPhone || undefined,
        lgpdOptIn: lgpdOptIn === true,
        country: country || 'AR',
      });

      if (result.isFailure) {
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      const worker = result.getValue();
      res.status(201).json({
        success: true,
        data: worker,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async saveStep(req: Request, res: Response): Promise<void> {
    try {
      const { workerId, step, data } = req.body;

      if (!workerId || !step) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: workerId, step',
        });
        return;
      }

      let result;

      switch (step) {
        case 1:
          result = await this.saveQuizUseCase.execute({
            workerId,
            responses: data.responses || [],
          });
          break;

        case 2:
          result = await this.savePersonalInfoUseCase.execute({
            workerId,
            ...data,
          });
          break;

        case 3:
          result = await this.saveServiceAreaUseCase.execute({
            workerId,
            ...data,
          });
          break;

        case 4:
          result = await this.saveAvailabilityUseCase.execute({
            workerId,
            availability: data.availability || [],
          });
          break;

        default:
          res.status(400).json({
            success: false,
            error: `Invalid step: ${step}. Must be 1-4`,
          });
          return;
      }

      if (result.isFailure) {
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: step === 1 ? { message: 'Quiz responses saved' } : result.getValue(),
      });
    } catch (error: any) {
      console.error('SaveStep error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  async getProgress(req: Request, res: Response): Promise<void> {
    try {
      // Support both header-based (legacy) and body-injected auth UID from middleware
      const authUid = (req as any).user?.uid || req.headers['x-auth-uid'] as string;

      if (!authUid) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: missing auth UID',
        });
        return;
      }

      const result = await this.getProgressUseCase.execute(authUid);

      if (result.isFailure) {
        res.status(404).json({
          success: false,
          error: result.error,
        });
        return;
      }

      const worker = result.getValue();
      res.status(200).json({
        success: true,
        data: worker,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  private async resolveWorkerIdFromAuth(authUid: string): Promise<string | null> {
    const result = await this.getProgressUseCase.execute(authUid);
    if (result.isFailure || !result.getValue()) return null;
    return result.getValue()!.id;
  }

  async saveGeneralInfo(req: Request, res: Response): Promise<void> {
    try {
      const authUid = (req as any).user?.uid || req.headers['x-auth-uid'] as string;
      if (!authUid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const workerId = await this.resolveWorkerIdFromAuth(authUid);
      if (!workerId) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }

      const result = await this.savePersonalInfoUseCase.execute({ workerId, ...req.body });

      if (result.isFailure) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.status(200).json({ success: true, data: { message: 'General info saved' } });
    } catch (error: any) {
      console.error('SaveGeneralInfo error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  async saveServiceArea(req: Request, res: Response): Promise<void> {
    try {
      const authUid = (req as any).user?.uid || req.headers['x-auth-uid'] as string;
      if (!authUid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const workerId = await this.resolveWorkerIdFromAuth(authUid);
      if (!workerId) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }

      const result = await this.saveServiceAreaUseCase.execute({ workerId, ...req.body });

      if (result.isFailure) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.status(200).json({ success: true, data: { message: 'Service area saved' } });
    } catch (error: any) {
      console.error('SaveServiceArea error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  async saveAvailability(req: Request, res: Response): Promise<void> {
    try {
      const authUid = (req as any).user?.uid || req.headers['x-auth-uid'] as string;
      if (!authUid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const workerId = await this.resolveWorkerIdFromAuth(authUid);
      if (!workerId) {
        res.status(404).json({ success: false, error: 'Worker not found' });
        return;
      }

      const result = await this.saveAvailabilityUseCase.execute({
        workerId,
        availability: req.body.availability || [],
      });

      if (result.isFailure) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.status(200).json({ success: true, data: { message: 'Availability saved' } });
    } catch (error: any) {
      console.error('SaveAvailability error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}
