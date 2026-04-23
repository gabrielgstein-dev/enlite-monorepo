import { Router, Request, Response } from 'express';
import { WorkerApplicationsController } from '../controllers/WorkerApplicationsController';
import { AuthMiddleware } from '@modules/identity';

/**
 * Worker applications routes — /api/worker-applications/*
 * All endpoints require worker authentication.
 */
export function createWorkerApplicationsRoutes(
  controller: WorkerApplicationsController,
  authMiddleware: AuthMiddleware,
): Router {
  const router = Router();
  const auth = authMiddleware.requireAuth();

  router.post('/worker-applications/track-channel', auth, (req: Request, res: Response) =>
    controller.trackChannel(req, res),
  );

  return router;
}
