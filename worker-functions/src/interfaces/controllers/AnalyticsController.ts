/**
 * AnalyticsController
 *
 * Endpoints de BI e deduplicação de workers.
 * Dashboard endpoints live in AnalyticsDashboardController (base class).
 *
 * Rotas sugeridas (registrar no router):
 *   GET  /analytics/workers
 *   GET  /analytics/workers/missing-documents
 *   GET  /analytics/workers/:workerId/vacancies
 *   GET  /analytics/vacancies
 *   GET  /analytics/vacancies/:id
 *   GET  /analytics/vacancies/case/:caseNumber
 *   GET  /analytics/vacancies/:id/incomplete-registrations
 *   GET  /analytics/dedup/candidates
 *   POST /analytics/dedup/run
 *   GET  /analytics/dashboard/global       (inherited)
 *   GET  /analytics/dashboard/cases/:id    (inherited)
 *   GET  /analytics/dashboard/zones        (inherited)
 *   GET  /analytics/dashboard/reemplazos   (inherited)
 */

import { Request, Response } from 'express';
import { AnalyticsRepository } from '../../infrastructure/repositories/AnalyticsRepository';
import { WorkerDeduplicationService } from '../../infrastructure/services/WorkerDeduplicationService';
import { AnalyticsDashboardController } from './AnalyticsDashboardController';

export class AnalyticsController extends AnalyticsDashboardController {
  private analyticsRepo: AnalyticsRepository;
  private dedupService: WorkerDeduplicationService;

  constructor() {
    super();
    this.analyticsRepo = new AnalyticsRepository();
    this.dedupService  = new WorkerDeduplicationService();
  }

  // ── Workers ───────────────────────────────────────────────────────────────

  /**
   * GET /analytics/workers
   * Totais de workers: por funnel_stage, registro completo, documentos faltando.
   */
  async getWorkerStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.analyticsRepo.countWorkers();
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/workers/missing-documents?funnelStage=QUALIFIED&limit=50&offset=0
   * Workers que ainda não enviaram documentos (ordenados por quem mais avançou nas vagas).
   */
  async getWorkersMissingDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { funnelStage, limit, offset } = req.query;
      const workers = await this.analyticsRepo.getWorkersMissingDocuments({
        funnelStage: funnelStage as string | undefined,
        limit:  limit  ? parseInt(limit as string)  : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json({ success: true, count: workers.length, data: workers });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/workers/:workerId/vacancies
   * Todas as vagas de um worker com status de cadastro e resultado em cada uma.
   * Responde: "se o worker que não terminou o cadastro para vaga X se cadastrou em outras vagas E SE completou o cadastro nelas".
   */
  async getWorkerVacancyEngagement(req: Request, res: Response): Promise<void> {
    try {
      const { workerId } = req.params;
      const data = await this.analyticsRepo.getWorkerVacancyEngagement(workerId);
      if (!data) {
        res.status(404).json({ success: false, error: 'Worker não encontrado' });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // ── Vagas ─────────────────────────────────────────────────────────────────

  /**
   * GET /analytics/vacancies?status=active&limit=50&offset=0
   * Lista todas as vagas com estatísticas.
   */
  async listVacancies(req: Request, res: Response): Promise<void> {
    try {
      const { status, limit, offset } = req.query;
      const data = await this.analyticsRepo.listJobPostingStats({
        status: status as string | undefined,
        limit:  limit  ? parseInt(limit as string)  : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/vacancies/:id
   * Estatísticas de uma vaga por UUID.
   * Responde: interessados, aprovados, pendentes, cadastros incompletos.
   */
  async getVacancyById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = await this.analyticsRepo.getJobPostingStats(id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Vaga não encontrada' });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/vacancies/case/:caseNumber
   * Estatísticas de uma vaga pelo número de caso (ex: 738).
   */
  async getVacancyByCaseNumber(req: Request, res: Response): Promise<void> {
    try {
      const caseNumber = parseInt(req.params.caseNumber);
      if (isNaN(caseNumber)) {
        res.status(400).json({ success: false, error: 'caseNumber inválido' });
        return;
      }
      const data = await this.analyticsRepo.getJobPostingStatsByCaseNumber(caseNumber);
      if (!data) {
        res.status(404).json({ success: false, error: `Vaga CASO ${caseNumber} não encontrada` });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/vacancies/:id/incomplete-registrations
   * Workers com cadastro incompleto vinculados à vaga X.
   * Para cada um: em quais outras vagas está e se completou o cadastro lá.
   */
  async getVacancyIncompleteRegistrations(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = await this.analyticsRepo.getWorkersIncompleteForVacancy(id);
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // ── Deduplicação ──────────────────────────────────────────────────────────

  /**
   * GET /analytics/dedup/candidates?limit=20
   * Lista pares de workers que podem ser duplicatas (sem chamar LLM).
   */
  async getDedupCandidates(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const candidates = await this.analyticsRepo.findDuplicateCandidates(limit);
      res.json({ success: true, count: candidates.length, data: candidates });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * POST /analytics/dedup/run
   * Body: { dryRun?: boolean, confidence?: number, limit?: number }
   * Executa o pipeline completo: detecta candidatos → analisa com LLM → mescla confirmados.
   */
  async runDeduplication(req: Request, res: Response): Promise<void> {
    try {
      const { dryRun = true, confidence = 0.85, limit = 10 } = req.body ?? {};
      console.log(`[Analytics] Iniciando deduplicação | dryRun=${dryRun} confidence=${confidence} limit=${limit}`);
      const report = await this.dedupService.runDeduplication({ dryRun, confidence, limit });
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}
