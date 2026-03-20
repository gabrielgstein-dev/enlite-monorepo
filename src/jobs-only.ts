import express, { Request, Response } from 'express';
import cors from 'cors';
import { JobsController } from './interfaces/controllers/JobsController';

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

const jobsController = new JobsController();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', service: 'jobs-only' });
});

// Jobs API
app.get('/api/jobs', (req: Request, res: Response) => {
  jobsController.getJobs(req, res);
});

app.post('/api/jobs/refresh', (req: Request, res: Response) => {
  jobsController.refreshJobs(req, res);
});

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`🚀 Jobs API running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/jobs`);
  console.log(`   POST http://localhost:${PORT}/api/jobs/refresh`);
});
