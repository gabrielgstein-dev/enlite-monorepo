import { Router, Request, Response } from 'express';
import { VacanciesController } from '../controllers/VacanciesController';
import { VacancyTalentumController } from '../controllers/VacancyTalentumController';
import { VacancyMatchController } from '../controllers/VacancyMatchController';
import { VacancyMeetLinksController } from '../controllers/VacancyMeetLinksController';
import { EncuadreFunnelController } from '../controllers/EncuadreFunnelController';
import { EncuadreDashboardController } from '../controllers/EncuadreDashboardController';
import { VacancyCrudController, pdfUploadMiddleware } from '../controllers/VacancyCrudController';
import { VacancySocialLinksController } from '../controllers/VacancySocialLinksController';
import { InterviewSlotsController } from '../controllers/InterviewSlotsController';
import { AuthMiddleware } from '@modules/identity';

/**
 * Admin vacancies routes — /api/admin/vacancies/* and related encuadre/funnel/slots.
 * All endpoints require staff authentication.
 *
 * IMPORTANTE: rotas estáticas antes das dinâmicas (ex: /stats, /next-case-number
 * antes de /:id) para evitar captura pelo param.
 */
export function createAdminVacanciesRoutes(
  vacanciesController: VacanciesController,
  vacancyCrudController: VacancyCrudController,
  vacancyTalentumController: VacancyTalentumController,
  vacancyMatchController: VacancyMatchController,
  vacancyMeetLinksController: VacancyMeetLinksController,
  vacancySocialLinksController: VacancySocialLinksController,
  funnelController: EncuadreFunnelController,
  dashboardController: EncuadreDashboardController,
  interviewSlotsController: InterviewSlotsController,
  authMiddleware: AuthMiddleware,
): Router {
  const router = Router();

  // ── Read (VacanciesController) ────────────────────────────────────────────────
  router.get('/vacancies', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacanciesController.listVacancies(req, res),
  );
  router.get('/vacancies/stats', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacanciesController.getVacanciesStats(req, res),
  );
  router.get('/vacancies/next-vacancy-number', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacanciesController.getNextVacancyNumber(req, res),
  );
  router.get('/vacancies/next-case-number', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacanciesController.getNextCaseNumber(req, res),
  );
  router.get('/vacancies/:id', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacanciesController.getVacancyById(req, res),
  );

  // ── CRUD (VacancyCrudController) ─────────────────────────────────────────────
  router.post('/vacancies/parse-from-text', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyCrudController.parseFromText(req, res),
  );
  router.post('/vacancies/parse-from-pdf', authMiddleware.requireStaff(), pdfUploadMiddleware, (req: Request, res: Response) =>
    vacancyCrudController.parseFromPdf(req, res),
  );
  router.post('/vacancies', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyCrudController.createVacancy(req, res),
  );
  router.put('/vacancies/:id', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyCrudController.updateVacancy(req, res),
  );
  router.delete('/vacancies/:id', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyCrudController.deleteVacancy(req, res),
  );

  // ── Match (VacancyMatchController) ────────────────────────────────────────────
  router.get('/vacancies/:id/match-results', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyMatchController.getMatchResults(req, res),
  );
  router.post('/vacancies/:id/match', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyMatchController.triggerMatch(req, res),
  );
  router.put('/encuadres/:id/result', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyMatchController.updateEncuadreResult(req, res),
  );

  // ── Talentum (VacancyTalentumController) ─────────────────────────────────────
  router.post('/vacancies/:id/publish-talentum', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.publishToTalentum(req, res),
  );
  router.delete('/vacancies/:id/publish-talentum', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.unpublishFromTalentum(req, res),
  );
  router.post('/vacancies/:id/generate-talentum-description', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.generateTalentumDescription(req, res),
  );
  router.post('/vacancies/sync-talentum', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.syncFromTalentum(req, res),
  );
  router.get('/vacancies/:id/prescreening-config', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.getPrescreeningConfig(req, res),
  );
  router.post('/vacancies/:id/prescreening-config', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyTalentumController.savePrescreeningConfig(req, res),
  );

  // ── Meet Links (VacancyMeetLinksController) ───────────────────────────────────
  router.put('/vacancies/:id/meet-links', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancyMeetLinksController.updateMeetLinks(req, res),
  );

  // ── Social Short Links (VacancySocialLinksController) ────────────────────────
  router.post('/vacancies/:id/social-links', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancySocialLinksController.generateSocialLink(req, res),
  );
  router.get('/vacancies/:id/social-links-stats', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    vacancySocialLinksController.getSocialLinksStats(req, res),
  );

  // ── Encuadre Funnel / Kanban (EncuadreFunnelController) ──────────────────────
  router.get('/vacancies/:id/funnel', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    funnelController.getEncuadreFunnel(req, res),
  );
  router.put('/encuadres/:id/move', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    funnelController.moveEncuadre(req, res),
  );

  // ── Coordinator Dashboard (EncuadreDashboardController) ──────────────────────
  router.get('/dashboard/coordinator-capacity', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    dashboardController.getCoordinatorCapacity(req, res),
  );
  router.get('/dashboard/alerts', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    dashboardController.getAlerts(req, res),
  );
  router.get('/dashboard/conversion-by-channel', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    dashboardController.getConversionByChannel(req, res),
  );

  // ── Interview Slots (InterviewSlotsController) ────────────────────────────────
  router.post('/vacancies/:id/interview-slots', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    interviewSlotsController.createSlots(req, res),
  );
  router.get('/vacancies/:id/interview-slots', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    interviewSlotsController.getSlots(req, res),
  );
  router.post('/interview-slots/:slotId/book', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    interviewSlotsController.bookSlot(req, res),
  );
  router.delete('/interview-slots/:slotId', authMiddleware.requireStaff(), (req: Request, res: Response) =>
    interviewSlotsController.cancelSlot(req, res),
  );

  return router;
}
