import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { WorkerControllerV2 } from './interfaces/controllers/WorkerControllerV2';
import { UserController } from './interfaces/controllers/UserController';
import { AdminController } from './interfaces/controllers/AdminController';
import { JobsController } from './interfaces/controllers/JobsController';
import { WorkerDocumentsMeController } from './interfaces/controllers/WorkerDocumentsMeController';
import { AdminWorkerDocumentsController } from './interfaces/controllers/AdminWorkerDocumentsController';
import { createAdminWorkerDocumentsRoutes } from './interfaces/routes/adminWorkerDocumentsRoutes';
import { WorkerAdditionalDocsMeController } from './interfaces/controllers/WorkerAdditionalDocsMeController';
import { AdminAdditionalDocsController } from './interfaces/controllers/AdminAdditionalDocsController';
import { createWorkerDocumentsRoutes } from './interfaces/routes/workerDocumentsRoutes';
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
import { VacancyCrudController } from './interfaces/controllers/VacancyCrudController';
import { VacancyTalentumController } from './interfaces/controllers/VacancyTalentumController';
import { VacancyMatchController } from './interfaces/controllers/VacancyMatchController';
import { AdminWorkersController } from './interfaces/controllers/AdminWorkersController';
import { PublicVacancyController } from './interfaces/controllers/PublicVacancyController';
import { EncuadreFunnelController } from './interfaces/controllers/EncuadreFunnelController';
import { EncuadreDashboardController } from './interfaces/controllers/EncuadreDashboardController';
import { WorkerApplicationsController } from './interfaces/controllers/WorkerApplicationsController';
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
import { createAnalyticsRoutes } from './interfaces/routes/analyticsRoutes';
import { createRecruitmentRoutes } from './interfaces/routes/recruitmentRoutes';
import { createAdminVacanciesRoutes } from './interfaces/routes/adminVacanciesRoutes';
import { createWorkerEncuadreRoutes } from './interfaces/routes/workerEncuadreRoutes';
import { createWorkerApplicationsRoutes } from './interfaces/routes/workerApplicationsRoutes';
import { InterviewSlotsController } from './interfaces/controllers/InterviewSlotsController';
import { ReminderScheduler } from './infrastructure/services/ReminderScheduler';
import { VacancyMeetLinksController } from './interfaces/controllers/VacancyMeetLinksController';
import { VacancySocialLinksController } from './interfaces/controllers/VacancySocialLinksController';
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

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// Timeout global de 5 minutos para requests de upload
app.use((req, res, next) => {
  if (req.path.includes('/upload')) {
    req.setTimeout(300000);
    res.setTimeout(300000);
  }
  next();
});

app.use(mockAuthMiddleware);

// ── Auth services ─────────────────────────────────────────────────────────────
const authService = new MultiAuthService({
  enableApiKeys: true,
  enableJwt: false,
  enableGoogleIdToken: true,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  internalTokenSecret: process.env.INTERNAL_TOKEN_SECRET,
});

const useCerbos = process.env.USE_CERBOS === 'true';
const authzEngine = useCerbos && process.env.CERBOS_ENDPOINT
  ? new CerbosAuthorizationAdapter({
      cerbosEndpoint: process.env.CERBOS_ENDPOINT,
      playgroundEnabled: process.env.NODE_ENV === 'development',
    })
  : new SimplifiedAuthorizationEngine();

const authMiddleware = new AuthMiddleware(authService, authzEngine);

// ── Controller instances ──────────────────────────────────────────────────────
const workerController = new WorkerControllerV2();
const userController = new UserController();
const adminController = new AdminController();
const jobsController = new JobsController();
const workerDocumentsMeController = new WorkerDocumentsMeController();
const adminWorkerDocumentsController = new AdminWorkerDocumentsController();
const workerAdditionalDocsMeController = new WorkerAdditionalDocsMeController();
const adminAdditionalDocsController = new AdminAdditionalDocsController();
const importController = new ImportController();
const encuadreController = new EncuadreController();
const analyticsController = new AnalyticsController();
const recruitmentController = new RecruitmentController();
const vacanciesController = new VacanciesController();
const vacancyCrudController = new VacancyCrudController();
const vacancyTalentumController = new VacancyTalentumController();
const vacancyMatchController = new VacancyMatchController();
const funnelController = new EncuadreFunnelController();
const dashboardController = new EncuadreDashboardController();
const workerApplicationsController = new WorkerApplicationsController();
const adminWorkersController = new AdminWorkersController();
const publicVacancyController = new PublicVacancyController();
const interviewSlotsController = new InterviewSlotsController();
const vacancyMeetLinksController = new VacancyMeetLinksController();
const vacancySocialLinksController = new VacancySocialLinksController();

// Messaging: shared instance with OutboxProcessor
const templateRepo = new MessageTemplateRepository();
const messagingService = new TwilioMessagingService(templateRepo);
const outboxProcessor = new OutboxProcessor(messagingService, DatabaseConnection.getInstance().getPool());

// ========== Public Routes ==========
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

createMockAuthEndpoints(app);

app.post('/api/workers/init', (req: Request, res: Response) => {
  workerController.initWorker(req, res);
});

const workerLookupRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests' },
});

app.get('/api/workers/lookup', workerLookupRateLimit, (req: Request, res: Response) => {
  workerController.lookupByEmail(req, res);
});

app.get('/api/vacancies/:id', (req: Request, res: Response) => {
  publicVacancyController.getById(req, res);
});

app.get('/api/jobs', (req: Request, res: Response) => {
  jobsController.getJobs(req, res);
});

// ========== Protected Worker Routes ==========
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
app.get('/api/workers/me/availability', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'read'), (req: Request, res: Response) => {
  workerController.getAvailability(req, res);
});
app.put('/api/workers/me/availability', authMiddleware.requireAuth(), authMiddleware.requirePermission('worker', 'update'), (req: Request, res: Response) => {
  workerController.saveAvailability(req, res);
});

// ========== User Routes ==========
app.delete('/api/users/me', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'delete'), (req: Request, res: Response) => {
  userController.deleteUser(req, res);
});
app.delete('/api/users/:userId', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'admin_delete'), (req: Request, res: Response) => {
  userController.deleteUserById(req, res);
});

// ========== Service-to-Service Routes ==========
app.post('/api/internal/workers/webhook', authMiddleware.requireApiKey(), (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Webhook received' });
});

// ========== Worker Applications ==========
app.use('/api', createWorkerApplicationsRoutes(workerApplicationsController, authMiddleware));

// ========== Worker Documents (fixed + additional) ==========
app.use('/api', createWorkerDocumentsRoutes(
  workerDocumentsMeController, workerAdditionalDocsMeController,
  adminAdditionalDocsController, authMiddleware,
));

// ========== Jobs refresh ==========
app.post('/api/jobs/refresh', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  jobsController.refreshJobs(req, res);
});

// ========== Import / Upload ==========
app.post('/api/import/upload', authMiddleware.requireAuth(), uploadMiddleware, (req: Request, res: Response) =>
  importController.uploadAndProcess(req, res),
);
app.get('/api/import/status/:id', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.getStatus(req, res),
);
app.get('/api/import/status/:id/stream', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.streamStatus(req, res),
);
app.get('/api/import/history', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.getHistory(req, res),
);
app.post('/api/import/enrich', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.triggerEnrichment(req, res),
);
app.get('/api/import/queue', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.getQueue(req, res),
);
app.post('/api/import/cancel/:id', authMiddleware.requireAuth(), (req: Request, res: Response) =>
  importController.cancelJob(req, res),
);

// ========== Admin Module ==========
app.post('/api/admin/setup', (req: Request, res: Response) => {
  adminController.setup(req, res);
});
app.post('/api/admin/users', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.createAdminUser(req, res);
});
app.get('/api/admin/users', authMiddleware.requireStaff(), (req: Request, res: Response) => {
  adminController.listAdminUsers(req, res);
});
app.delete('/api/admin/users/:id', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.deleteAdminUser(req, res);
});
app.post('/api/admin/users/:id/reset-password', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.resetAdminPassword(req, res);
});
app.post('/api/admin/auth/change-password', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.changePassword(req, res);
});
app.delete('/api/admin/users/by-email', authMiddleware.requireAdmin(), (req: Request, res: Response) => {
  adminController.deleteUserByEmail(req, res);
});
// NOTE: requireAuth (not requireAdmin) — auto-provisioning on first Google login.
app.get('/api/admin/auth/profile', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  adminController.getProfile(req, res);
});

// ========== Worker Status & Encuadres ==========
app.use('/api', createWorkerEncuadreRoutes(encuadreController, authMiddleware));

// ========== Admin Workers ==========
const staffOnly = authMiddleware.requireStaff();
const adminOnly = authMiddleware.requireAdmin();
app.get('/api/admin/workers/stats', staffOnly, (req: Request, res: Response) => adminWorkersController.getWorkerDateStats(req, res));
app.get('/api/admin/workers/by-phone', staffOnly, (req: Request, res: Response) => adminWorkersController.getWorkerByPhone(req, res));
app.get('/api/admin/workers/case-options', staffOnly, (req: Request, res: Response) => adminWorkersController.listCaseOptions(req, res));
app.post('/api/admin/workers/sync-talentum', staffOnly, (req: Request, res: Response) => adminWorkersController.syncTalentumWorkers(req, res));
// export MUST be registered before /:id to avoid param capture
app.get('/api/admin/workers/export', adminOnly, (req: Request, res: Response) => adminWorkersController.exportWorkers(req, res));
app.get('/api/admin/workers/:id', staffOnly, (req: Request, res: Response) => adminWorkersController.getWorkerById(req, res));
app.get('/api/admin/workers', staffOnly, (req: Request, res: Response) => adminWorkersController.listWorkers(req, res));

app.use('/api/admin', createAdminWorkerDocumentsRoutes(adminWorkerDocumentsController, authMiddleware));

// ========== Admin Vacancies (extracted router) ==========
app.use('/api/admin', createAdminVacanciesRoutes(
  vacanciesController,
  vacancyCrudController,
  vacancyTalentumController,
  vacancyMatchController,
  vacancyMeetLinksController,
  vacancySocialLinksController,
  funnelController,
  dashboardController,
  interviewSlotsController,
  authMiddleware,
));

// ========== Analytics & BI (extracted router) ==========
app.use('/analytics', createAnalyticsRoutes(analyticsController, authMiddleware));

// ========== Recruitment (extracted router) ==========
app.use('/api', createRecruitmentRoutes(recruitmentController, authMiddleware));

// ========== Webhooks — Partner Auth ==========
const googleValidator = new GoogleApiKeyValidator();
const webhookPartnerRepo = new WebhookPartnerRepository();
const partnerAuth = new PartnerAuthMiddleware(googleValidator, webhookPartnerRepo);

const googleCalendarService = new GoogleCalendarService();
const bookSlotUseCase = new BookSlotFromWhatsAppUseCase(
  DatabaseConnection.getInstance().getPool(),
  new PubSubClient(),
  new CloudTasksClient(),
  googleCalendarService,
);
const handleReminderResponseUseCase = new HandleReminderResponseUseCase(
  DatabaseConnection.getInstance().getPool(),
  new PubSubClient(),
  googleCalendarService,
);
const inboundWhatsAppController = new InboundWhatsAppController(
  DatabaseConnection.getInstance().getPool(),
  bookSlotUseCase,
  handleReminderResponseUseCase,
);

app.use('/api/webhooks', createWebhookRoutes(partnerAuth, inboundWhatsAppController));
app.use('/api/webhooks-test', createWebhookRoutes(partnerAuth, inboundWhatsAppController));

// ========== Messaging Routes ==========
app.use('/api/admin/messaging', authMiddleware.requireStaff(), createMessagingRoutes(messagingService, templateRepo));

// ========== Internal Routes (Pub/Sub, Cloud Tasks, Cloud Scheduler) ==========
const dbPool = DatabaseConnection.getInstance().getPool();
const cloudTasksClient = new CloudTasksClient();
const pubsubClient = new PubSubClient();
const tokenService = new TokenService(dbPool);
const domainEventProcessor = new DomainEventProcessor(dbPool);

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

importQueue.initialize().catch(err => {
  console.error('[ImportQueue] initialize error (non-fatal):', err);
});

console.log('[EventDriven] Services wired — no polling timers');

const server = app.listen(PORT, () => {
  console.log(`Enlite Backend running on port ${PORT}`);
  console.log(`Authorization engine: ${useCerbos ? 'Cerbos' : 'Local'}`);
});

server.timeout = 300000; // 5 minutos
server.keepAliveTimeout = 310000;
server.headersTimeout = 320000;
export { app };
