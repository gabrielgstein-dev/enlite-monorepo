import express, { Request, Response } from 'express';
import cors from 'cors';
import { WorkerControllerV2 } from './interfaces/controllers/WorkerControllerV2';
import { UserController } from './interfaces/controllers/UserController';
import { AdminController } from './interfaces/controllers/AdminController';
import { JobsController } from './interfaces/controllers/JobsController';
import { WorkerDocumentsMeController } from './interfaces/controllers/WorkerDocumentsMeController';
import { AuthMiddleware } from './interfaces/middleware/AuthMiddleware';
import { MultiAuthService } from './infrastructure/services/MultiAuthService';
import { SimplifiedAuthorizationEngine } from './infrastructure/services/SimplifiedAuthorizationEngine';
import { CerbosAuthorizationAdapter } from './infrastructure/services/CerbosAuthorizationAdapter';
import { mockAuthMiddleware, createMockAuthEndpoints } from './infrastructure/middleware/MockAuthMiddleware';
import { ImportController, uploadMiddleware } from './infrastructure/services/ImportController';
import { importQueue } from './infrastructure/services/ImportQueue';
import { EncuadreController } from './interfaces/controllers/EncuadreController';
import { AnalyticsController } from './interfaces/controllers/AnalyticsController';
import { RecruitmentController } from './interfaces/controllers/RecruitmentController';
import { VacanciesController } from './interfaces/controllers/VacanciesController';
import { AdminWorkersController } from './interfaces/controllers/AdminWorkersController';
import { EncuadreFunnelController } from './interfaces/controllers/EncuadreFunnelController';
import { MessageTemplateRepository } from './infrastructure/repositories/MessageTemplateRepository';
import { TwilioMessagingService } from './infrastructure/services/TwilioMessagingService';
import { OutboxProcessor } from './infrastructure/services/OutboxProcessor';
import { BulkDispatchScheduler } from './infrastructure/services/BulkDispatchScheduler';
import { DatabaseConnection } from './infrastructure/database/DatabaseConnection';
import { createWebhookRoutes } from './interfaces/webhooks/routes/webhookRoutes';
import { PartnerAuthMiddleware } from './interfaces/webhooks/middleware/PartnerAuthMiddleware';
import { GoogleApiKeyValidator } from './infrastructure/services/GoogleApiKeyValidator';
import { WebhookPartnerRepository } from './infrastructure/repositories/WebhookPartnerRepository';
import { createMessagingRoutes } from './interfaces/routes/messagingRoutes';
import { InterviewSlotsController } from './interfaces/controllers/InterviewSlotsController';
import { ReminderScheduler } from './infrastructure/services/ReminderScheduler';
import { VacancyMeetLinksController } from './interfaces/controllers/VacancyMeetLinksController';
import { DomainEventProcessor } from './infrastructure/events/DomainEventProcessor';
import { CloudTasksClient } from './infrastructure/events/CloudTasksClient';
import { PubSubClient } from './infrastructure/events/PubSubClient';
import { createQualifiedInterviewHandler } from './infrastructure/events/handlers/QualifiedInterviewHandler';
import { TokenService } from './infrastructure/services/TokenService';
import { InternalController } from './interfaces/controllers/InternalController';
import { createInternalRoutes } from './interfaces/routes/internalRoutes';
import { BookSlotFromWhatsAppUseCase } from './application/use-cases/BookSlotFromWhatsAppUseCase';
import { HandleReminderResponseUseCase } from './application/use-cases/HandleReminderResponseUseCase';
import { InboundWhatsAppController } from './interfaces/webhooks/controllers/InboundWhatsAppController';
import { GoogleCalendarService } from './infrastructure/services/GoogleCalendarService';

const app = express();

// CORS configuration
const allowedOrigins = [
  'https://enlite-frontend-121472682203.southamerica-west1.run.app',
  'https://app.enlite.health',
  'https://enlite-n8n-121472682203.southamerica-west1.run.app',
  'https://n8n.enlite.health',
  'http://localhost:3000', // Local development
  'http://localhost:5173', // Vite default port
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Partner-Key'],
}));

// Aumentar limites e timeouts para uploads grandes
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// Timeout global de 5 minutos para requests de upload
app.use((req, res, next) => {
  if (req.path.includes('/upload')) {
    req.setTimeout(300000); // 5 minutos
    res.setTimeout(300000);
  }
  next();
});

// Mock auth middleware for E2E testing (when USE_MOCK_AUTH=true)
app.use(mockAuthMiddleware);

// Initialize authentication and authorization services
const authService = new MultiAuthService({
  enableApiKeys: true,
  enableJwt: false, // Enable when JWT implementation is ready
  enableGoogleIdToken: true,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  internalTokenSecret: process.env.INTERNAL_TOKEN_SECRET,
});

// Choose authorization engine based on environment
const useCerbos = process.env.USE_CERBOS === 'true';
const authzEngine = useCerbos && process.env.CERBOS_ENDPOINT
  ? new CerbosAuthorizationAdapter({
      cerbosEndpoint: process.env.CERBOS_ENDPOINT,
      playgroundEnabled: process.env.NODE_ENV === 'development',
    })
  : new SimplifiedAuthorizationEngine();

// Initialize middleware
const authMiddleware = new AuthMiddleware(authService, authzEngine);

const workerController = new WorkerControllerV2();
const userController = new UserController();
const adminController = new AdminController();
const jobsController = new JobsController();
const workerDocumentsMeController = new WorkerDocumentsMeController();
const importController = new ImportController();
const encuadreController = new EncuadreController();
const analyticsController = new AnalyticsController();
const recruitmentController = new RecruitmentController();
const vacanciesController = new VacanciesController();
const funnelController = new EncuadreFunnelController();
const adminWorkersController = new AdminWorkersController();
const interviewSlotsController = new InterviewSlotsController();
const vacancyMeetLinksController = new VacancyMeetLinksController();

// Messaging: criados aqui para compartilhar instância com OutboxProcessor
const templateRepo = new MessageTemplateRepository();
const messagingService = new TwilioMessagingService(templateRepo);
const outboxProcessor = new OutboxProcessor(messagingService, DatabaseConnection.getInstance().getPool());

// ========== Public Routes (Health Check) ==========
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ========== Test Routes (E2E only) ==========
// Register mock auth endpoints for testing
createMockAuthEndpoints(app);

// ========== Public Worker Init (Temporary for local dev) ==========
app.post('/api/workers/init', (req: Request, res: Response) => {
  workerController.initWorker(req, res);
});

// ========== Protected Routes - Require Authentication ==========

app.put('/api/workers/step', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'update'), (req: Request, res: Response) => {
  workerController.saveStep(req, res);
});

app.get('/api/workers/me', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'read'), (req: Request, res: Response) => {
  workerController.getProgress(req, res);
});

app.put('/api/workers/me/general-info', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'update'), (req: Request, res: Response) => {
  workerController.saveGeneralInfo(req, res);
});

app.put('/api/workers/me/service-area', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'update'), (req: Request, res: Response) => {
  workerController.saveServiceArea(req, res);
});

// REMOVED: Availability route - feature discontinued in migration 028
// app.put('/api/workers/me/availability', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'update'), (req: Request, res: Response) => {
//   workerController.saveAvailability(req, res);
// });

// User management routes
app.delete('/api/users/me', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'delete'), (req: Request, res: Response) => {
  userController.deleteUser(req, res);
});

app.delete('/api/users/:userId', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'admin_delete'), (req: Request, res: Response) => {
  userController.deleteUserById(req, res);
});

// ========== Admin Routes ==========
// Admin endpoint to delete user by email (deletes from Google Identity + all DB records)
app.delete('/api/admin/users/by-email', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.deleteUserByEmail(req, res);
});

// ========== Service-to-Service Routes (API Key) ==========
// These routes can be called by n8n, React frontend, or other services
app.post('/api/internal/workers/webhook', authMiddleware.requireApiKey(), (req: Request, res: Response) => {
  // n8n webhook endpoint
  res.status(200).json({ success: true, message: 'Webhook received' });
});

// ========== Worker Documents (Authenticated worker's own documents) ==========
app.get('/api/workers/me/documents', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  workerDocumentsMeController.getDocuments(req, res);
});

app.post('/api/workers/me/documents/upload-url', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  workerDocumentsMeController.getUploadSignedUrl(req, res);
});

app.post('/api/workers/me/documents/save', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  workerDocumentsMeController.saveDocumentPath(req, res);
});

app.post('/api/workers/me/documents/view-url', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  workerDocumentsMeController.getViewSignedUrl(req, res);
});

app.delete('/api/workers/me/documents/:type', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  workerDocumentsMeController.deleteDocument(req, res);
});

// ========== Jobs Routes (Public - No Auth Required) ==========
app.get('/api/jobs', (req: Request, res: Response) => {
  jobsController.getJobs(req, res);
});

app.post('/api/jobs/refresh', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  jobsController.refreshJobs(req, res);
});

// ========== Import / Upload de Planilhas ==========

app.post(
  '/api/import/upload',
  authMiddleware.requireAuth(),
  uploadMiddleware,
  (req: Request, res: Response) => importController.uploadAndProcess(req, res)
);

app.get(
  '/api/import/status/:id',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.getStatus(req, res)
);

app.get(
  '/api/import/status/:id/stream',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.streamStatus(req, res)
);

app.get(
  '/api/import/history',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.getHistory(req, res)
);

app.post(
  '/api/import/enrich',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.triggerEnrichment(req, res)
);

app.get(
  '/api/import/queue',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.getQueue(req, res)
);

app.post(
  '/api/import/cancel/:id',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.cancelJob(req, res)
);

// ========== Admin Module ==========

// Bootstrap — public, auto-disables after first admin created
app.post('/api/admin/setup', (req: Request, res: Response) => {
  adminController.setup(req, res);
});

// Admin CRUD — requires admin role (requireAdmin already calls requireAuth internally)
app.post('/api/admin/users', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.createAdminUser(req, res);
});

app.get('/api/admin/users', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.listAdminUsers(req, res);
});

app.delete('/api/admin/users/:id', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.deleteAdminUser(req, res);
});

app.post('/api/admin/users/:id/reset-password', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.resetAdminPassword(req, res);
});

// Admin auth — requires admin role
app.post('/api/admin/auth/change-password', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.changePassword(req, res);
});

app.get('/api/admin/auth/profile', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.getProfile(req, res);
});

// ========== Status de Plataforma (substituiu funil de recrutamento) ==========

app.get(
  '/api/workers/status-dashboard',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getStatusDashboard(req, res)
);

app.get(
  '/api/workers/by-status/:status',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getWorkersByStatus(req, res)
);

app.put(
  '/api/workers/:id/status',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.updateWorkerStatus(req, res)
);

app.put(
  '/api/workers/:id/occupation',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.updateOccupation(req, res)
);

// ========== Vencimento de Documentos ==========

app.get(
  '/api/workers/docs-expiring',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getDocsExpiringSoon(req, res)
);

app.put(
  '/api/workers/:id/doc-expiry',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.updateDocExpiry(req, res)
);

// ========== Histórico de Encuadres ==========

app.get(
  '/api/workers/:id/encuadres',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getWorkerEncuadres(req, res)
);

app.get(
  '/api/workers/:id/cases',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getWorkerCases(req, res)
);

app.get(
  '/api/cases/:caseNumber/encuadres',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getCaseEncuadres(req, res)
);

app.get(
  '/api/cases/:caseNumber/workers',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getCaseWorkers(req, res)
);

// ========== Analytics & BI ==========
// Todos os endpoints exigem autenticação de admin.
// IMPORTANTE: rotas estáticas antes das dinâmicas para evitar captura pelo param.

// GET /analytics/workers — totais por funnel_stage, cadastro completo, docs faltando
app.get(
  '/analytics/workers',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getWorkerStats(req, res)
);

// GET /analytics/workers/missing-documents — ANTES de /:workerId para não capturar
app.get(
  '/analytics/workers/missing-documents',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getWorkersMissingDocuments(req, res)
);

// GET /analytics/workers/:workerId/vacancies
app.get(
  '/analytics/workers/:workerId/vacancies',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getWorkerVacancyEngagement(req, res)
);

// GET /analytics/vacancies — lista com estatísticas
app.get(
  '/analytics/vacancies',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.listVacancies(req, res)
);

// GET /analytics/vacancies/case/:caseNumber — ANTES de /:id para não capturar "case"
app.get(
  '/analytics/vacancies/case/:caseNumber',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getVacancyByCaseNumber(req, res)
);

// GET /analytics/vacancies/:id
app.get(
  '/analytics/vacancies/:id',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getVacancyById(req, res)
);

// GET /analytics/vacancies/:id/incomplete-registrations
app.get(
  '/analytics/vacancies/:id/incomplete-registrations',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getVacancyIncompleteRegistrations(req, res)
);

// GET /analytics/dedup/candidates?limit=20
app.get(
  '/analytics/dedup/candidates',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getDedupCandidates(req, res)
);

// POST /analytics/dedup/run  — { dryRun?, confidence?, limit? }
app.post(
  '/analytics/dedup/run',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.runDeduplication(req, res)
);

// ========== Dashboard Analytics ==========
// Endpoints consumidos pelo Dashboard (client ou server-side).

// GET /analytics/dashboard/global?startDate=&endDate=&country=AR
app.get(
  '/analytics/dashboard/global',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getGlobalMetrics(req, res)
);

// GET /analytics/dashboard/zones?country=AR
app.get(
  '/analytics/dashboard/zones',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getZoneMetrics(req, res)
);

// GET /analytics/dashboard/reemplazos?country=AR
app.get(
  '/analytics/dashboard/reemplazos',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getReemplazosMetrics(req, res)
);

// GET /analytics/dashboard/cases/:caseNumber?startDate=&endDate=
// NOTA: rota estática /zones e /reemplazos devem vir ANTES desta rota paramétrica
app.get(
  '/analytics/dashboard/cases/:caseNumber',
  authMiddleware.requireAdmin(),
  (req: Request, res: Response) => analyticsController.getCaseMetrics(req, res)
);

// ========== Temporary Routes for Testing (No Auth) ==========
// These endpoints are temporary for testing pagination without auth
// TODO: Remove these endpoints in production

app.get('/api/test/recruitment/clickup-cases', (req: Request, res: Response) => {
  recruitmentController.getClickUpCases(req, res);
});

app.get('/api/test/recruitment/talentum-workers', (req: Request, res: Response) => {
  recruitmentController.getTalentumWorkers(req, res);
});

app.get('/api/test/recruitment/progreso', (req: Request, res: Response) => {
  recruitmentController.getProgresoWorkers(req, res);
});

app.get('/api/test/recruitment/publications', (req: Request, res: Response) => {
  recruitmentController.getPublications(req, res);
});

app.get('/api/test/recruitment/encuadres', (req: Request, res: Response) => {
  recruitmentController.getEncuadres(req, res);
});

app.get('/api/test/recruitment/global-metrics', (req: Request, res: Response) => {
  recruitmentController.getGlobalMetrics(req, res);
});

// ========== Recruitment Dashboard Routes ==========
app.get('/api/admin/recruitment/clickup-cases', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getClickUpCases(req, res);
});

app.get('/api/admin/recruitment/talentum-workers', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getTalentumWorkers(req, res);
});

app.get('/api/admin/recruitment/progreso', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getProgresoWorkers(req, res);
});

app.get('/api/admin/recruitment/publications', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getPublications(req, res);
});

app.get('/api/admin/recruitment/encuadres', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getEncuadres(req, res);
});

app.get('/api/admin/recruitment/global-metrics', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getGlobalMetrics(req, res);
});

app.get('/api/admin/recruitment/case/:caseNumber', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getCaseAnalysis(req, res);
});

app.get('/api/admin/recruitment/zones', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.getZoneAnalysis(req, res);
});

app.post('/api/admin/recruitment/calculate-reemplazos', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  recruitmentController.calculateReemplazos(req, res);
});

// ========== Admin Workers Routes ==========
app.get('/api/admin/workers/stats', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminWorkersController.getWorkerDateStats(req, res);
});

app.get('/api/admin/workers', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminWorkersController.listWorkers(req, res);
});

// ========== Vacancies Routes ==========
app.get('/api/admin/vacancies', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.listVacancies(req, res);
});

app.get('/api/admin/vacancies/stats', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.getVacanciesStats(req, res);
});

app.get('/api/admin/vacancies/:id', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.getVacancyById(req, res);
});

app.post('/api/admin/vacancies', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.createVacancy(req, res);
});

app.put('/api/admin/vacancies/:id', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.updateVacancy(req, res);
});

app.delete('/api/admin/vacancies/:id', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.deleteVacancy(req, res);
});

// GET  /api/admin/vacancies/:id/match-results — Resultados salvos (sem re-rodar LLM)
// POST /api/admin/vacancies/:id/match         — Dispara matchmaking (frontend manual + auto ao abrir vaga)
// POST /api/admin/vacancies/:id/enrich        — Re-parseia campos de texto livre com LLM
app.get('/api/admin/vacancies/:id/match-results', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.getMatchResults(req, res);
});

app.post('/api/admin/vacancies/:id/match', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.triggerMatch(req, res);
});

app.post('/api/admin/vacancies/:id/enrich', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.reEnrichJobPosting(req, res);
});

// PUT /api/admin/vacancies/:id/meet-links — Salva Google Meet links + datetimes resolvidos via Calendar API
app.put('/api/admin/vacancies/:id/meet-links', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacancyMeetLinksController.updateMeetLinks(req, res);
});

// PUT /api/admin/encuadres/:id/result — Update encuadre resultado with structured rejection
app.put('/api/admin/encuadres/:id/result', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  vacanciesController.updateEncuadreResult(req, res);
});

// ========== Encuadre Funnel / Kanban ==========
app.get('/api/admin/vacancies/:id/funnel', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  funnelController.getEncuadreFunnel(req, res);
});
app.put('/api/admin/encuadres/:id/move', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  funnelController.moveEncuadre(req, res);
});

// ========== Coordinator Dashboard ==========
app.get('/api/admin/dashboard/coordinator-capacity', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  funnelController.getCoordinatorCapacity(req, res);
});
app.get('/api/admin/dashboard/alerts', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  funnelController.getAlerts(req, res);
});
app.get('/api/admin/dashboard/conversion-by-channel', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  funnelController.getConversionByChannel(req, res);
});

// ========== Interview Slots (Wave 2) ==========
app.post('/api/admin/vacancies/:id/interview-slots', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  interviewSlotsController.createSlots(req, res);
});
app.get('/api/admin/vacancies/:id/interview-slots', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  interviewSlotsController.getSlots(req, res);
});
app.post('/api/admin/interview-slots/:slotId/book', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  interviewSlotsController.bookSlot(req, res);
});
app.delete('/api/admin/interview-slots/:slotId', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  interviewSlotsController.cancelSlot(req, res);
});

// ========== Webhooks — Partner Auth (validação via Google API Key) ==========
const googleValidator = new GoogleApiKeyValidator();
const webhookPartnerRepo = new WebhookPartnerRepository();
const partnerAuth = new PartnerAuthMiddleware(googleValidator, webhookPartnerRepo);

// Step 7-8: Inbound WhatsApp (booking + reminder response)
const googleCalendarService = new GoogleCalendarService();
const bookSlotUseCase = new BookSlotFromWhatsAppUseCase(
  DatabaseConnection.getInstance().getPool(),
  new PubSubClient(),
  new TokenService(DatabaseConnection.getInstance().getPool()),
  new CloudTasksClient(),
  googleCalendarService,
);
const handleReminderResponseUseCase = new HandleReminderResponseUseCase(
  DatabaseConnection.getInstance().getPool(),
  new PubSubClient(),
  new TokenService(DatabaseConnection.getInstance().getPool()),
  googleCalendarService,
);
const inboundWhatsAppController = new InboundWhatsAppController(bookSlotUseCase, handleReminderResponseUseCase);

app.use('/api/webhooks', createWebhookRoutes(partnerAuth, inboundWhatsAppController));

// Endpoints de teste para parceiros — sempre habilitado (autenticação via X-Partner-Key garante segurança)
app.use('/api/webhooks-test', createWebhookRoutes(partnerAuth, inboundWhatsAppController));

// ========== Messaging Routes ==========
app.use('/api/admin/messaging', authMiddleware.requireAdmin(), createMessagingRoutes(messagingService, templateRepo));

// ========== Internal Routes (Pub/Sub, Cloud Tasks, Cloud Scheduler) ==========
const dbPool = DatabaseConnection.getInstance().getPool();
const cloudTasksClient = new CloudTasksClient();
const pubsubClient = new PubSubClient();
const tokenService = new TokenService(dbPool);
const domainEventProcessor = new DomainEventProcessor(dbPool);

// Registrar handler para evento funnel_stage.qualified (Step 5)
domainEventProcessor.registerHandler(
  'funnel_stage.qualified',
  createQualifiedInterviewHandler(dbPool, pubsubClient, tokenService),
);

const reminderScheduler = new ReminderScheduler(dbPool, cloudTasksClient, pubsubClient, tokenService);
const bulkDispatchScheduler = new BulkDispatchScheduler(dbPool, messagingService);
const internalController = new InternalController(domainEventProcessor, outboxProcessor, reminderScheduler, bulkDispatchScheduler);
app.use('/api/internal', createInternalRoutes(internalController));

// ========== Start Server ==========
const PORT = process.env.PORT || 8080;

// Recovery: marca como cancelled/error jobs que ficaram travados por um restart anterior
importQueue.initialize().catch(err => {
  console.error('[ImportQueue] initialize error (non-fatal):', err);
});

// Event-driven: OutboxProcessor, ReminderScheduler e BulkDispatchScheduler
// não usam mais polling (setInterval). São acionados via:
//   - Pub/Sub push → /api/internal/outbox/process (OutboxProcessor)
//   - Cloud Tasks → /api/internal/reminders/* (ReminderScheduler)
//   - Cloud Scheduler → /api/internal/bulk-dispatch/process (BulkDispatchScheduler)
//   - Cloud Scheduler → /api/internal/outbox/sweep (safety net, a cada 5min)
console.log('[EventDriven] Services wired — no polling timers');

const server = app.listen(PORT, () => {
  console.log(`Enlite Backend running on port ${PORT}`);
  console.log(`Authorization engine: ${useCerbos ? 'Cerbos' : 'Local'}`);
});

// Aumentar timeout do servidor para 5 minutos (uploads grandes)
server.timeout = 300000; // 5 minutos
server.keepAliveTimeout = 310000; // 5min + 10s
server.headersTimeout = 320000; // 5min + 20s

export { app };
