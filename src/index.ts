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
import { EncuadreController } from './interfaces/controllers/EncuadreController';

const app = express();

// CORS configuration
const allowedOrigins = [
  'https://enlite-frontend-121472682203.us-central1.run.app',
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
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// User management routes
app.delete('/api/users/me', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'delete'), (req: Request, res: Response) => {
  userController.deleteUser(req, res);
});

app.delete('/api/users/:userId', authMiddleware.requireAuth(), authMiddleware.requirePermission('user', 'admin_delete'), (req: Request, res: Response) => {
  userController.deleteUserById(req, res);
});

// ========== Admin Routes ==========
// Admin endpoint to delete user by email (deletes from Google Identity + all DB records)
// TEMPORARY: No auth for testing purposes
app.delete('/api/admin/users/by-email', (req: Request, res: Response) => {
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
  '/api/import/history',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.getHistory(req, res)
);

app.post(
  '/api/import/enrich',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => importController.triggerEnrichment(req, res)
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

// Admin auth — requires authentication (admin checks profile to verify role)
app.post('/api/admin/auth/change-password', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  adminController.changePassword(req, res);
});

app.get('/api/admin/auth/profile', authMiddleware.requireAuth(), (req: Request, res: Response) => {
  adminController.getProfile(req, res);
});

// ========== Funil de Recrutamento ==========

app.get(
  '/api/workers/funnel',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getFunnelDashboard(req, res)
);

app.get(
  '/api/workers/funnel/:stage',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.getWorkersByFunnelStage(req, res)
);

app.put(
  '/api/workers/:id/funnel-stage',
  authMiddleware.requireAuth(),
  (req: Request, res: Response) => encuadreController.updateFunnelStage(req, res)
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

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`Enlite Backend running on port ${PORT}`);
  console.log(`Authorization engine: ${useCerbos ? 'Cerbos' : 'Local'}`);
});

// Aumentar timeout do servidor para 5 minutos (uploads grandes)
server.timeout = 300000; // 5 minutos
server.keepAliveTimeout = 310000; // 5min + 10s
server.headersTimeout = 320000; // 5min + 20s

export { app };
