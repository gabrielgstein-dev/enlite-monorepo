import { Router, Request, Response } from 'express';
import { AdminPatientsController } from '../controllers/AdminPatientsController';
import { AuthMiddleware } from '@modules/identity';

/**
 * Admin patients routes — mounted at /api/admin.
 * All endpoints require staff authentication (same pattern as /api/admin/workers).
 *
 * NOTE: /patients/stats must be registered BEFORE any future /patients/:id
 * route to avoid Express param capture.
 */
export function createAdminPatientsRoutes(
  controller: AdminPatientsController,
  authMiddleware: AuthMiddleware,
): Router {
  const router = Router();
  const staffOnly = authMiddleware.requireStaff();

  // Static routes first (guard against future /:id capture)
  router.get('/patients/stats', staffOnly, (req: Request, res: Response) =>
    controller.getPatientStats(req, res),
  );

  router.get('/patients', staffOnly, (req: Request, res: Response) =>
    controller.listPatients(req, res),
  );

  // Dynamic route last — Express would capture /stats as /:id otherwise.
  router.get('/patients/:id', staffOnly, (req: Request, res: Response) =>
    controller.getPatientById(req, res),
  );

  return router;
}
