import { Router, Request, Response } from 'express';
import { AdminWorkerDocumentsController } from '../controllers/AdminWorkerDocumentsController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

/**
 * Admin worker documents routes — /api/admin/workers/:id/documents/*
 * All endpoints require staff access.
 */
export function createAdminWorkerDocumentsRoutes(
  controller: AdminWorkerDocumentsController,
  authMiddleware: AuthMiddleware,
): Router {
  const router = Router();
  const staffOnly = authMiddleware.requireStaff();

  router.post('/workers/:id/documents/upload-url', staffOnly, (req: Request, res: Response) =>
    controller.getUploadSignedUrl(req, res),
  );
  router.post('/workers/:id/documents/save', staffOnly, (req: Request, res: Response) =>
    controller.saveDocumentPath(req, res),
  );
  router.post('/workers/:id/documents/view-url', staffOnly, (req: Request, res: Response) =>
    controller.getViewSignedUrl(req, res),
  );
  router.delete('/workers/:id/documents/:type', staffOnly, (req: Request, res: Response) =>
    controller.deleteDocument(req, res),
  );

  return router;
}
