/**
 * AnalyticsController
 *
 * Endpoints de BI e deduplicação de workers.
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
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AnalyticsRepository } from '../../infrastructure/repositories/AnalyticsRepository';
import { WorkerDeduplicationService } from '../../infrastructure/services/WorkerDeduplicationService';
import { ClickUpCaseRepository } from '../../infrastructure/repositories/ClickUpCaseRepository';
import { EncuadreRepository } from '../../infrastructure/repositories/EncuadreRepository';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import {
  PublicationRepository,
  WorkerApplicationRepository,
  JobPostingARRepository,
} from '../../infrastructure/repositories/OperationalRepositories';

export class AnalyticsController {
  private analyticsRepo: AnalyticsRepository;
  private dedupService: WorkerDeduplicationService;
  private db: Pool;

  constructor() {
    this.analyticsRepo = new AnalyticsRepository();
    this.dedupService  = new WorkerDeduplicationService();
    this.db            = DatabaseConnection.getInstance().getPool();
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

  // ── Dashboard Analytics ────────────────────────────────────────────────────

  /**
   * GET /analytics/dashboard/global?startDate=&endDate=&country=AR
   * Métricas globais para o painel principal do Dashboard.
   */
  async getGlobalMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, country = 'AR' } = req.query as Record<string, string>;
      const filters = { startDate, endDate, country };

      const clickUpRepo     = new ClickUpCaseRepository();
      const encuadreRepo    = new EncuadreRepository();
      const publicationRepo = new PublicationRepository();

      // Count workers by platform status (replaces old overall_status funnel grouping)
      const countByStatus = async (status: string): Promise<number> => {
        const conditions: string[] = [`w.status = $1`];
        const values: unknown[] = [status];
        let idx = 2;
        if (filters.startDate) { conditions.push(`w.created_at >= $${idx++}`); values.push(filters.startDate); }
        if (filters.endDate)   { conditions.push(`w.created_at <= $${idx++}`); values.push(filters.endDate); }
        if (filters.country)   { conditions.push(`w.country = $${idx++}`);     values.push(filters.country); }
        const { rows } = await this.db.query(
          `SELECT COUNT(*)::int AS count FROM workers w WHERE ${conditions.join(' AND ')}`,
          values
        );
        return (rows[0]?.count as number) ?? 0;
      };

      const [activeCases, postulantesCount, candidatosCount, publicationsByChannel, encuadresCount] =
        await Promise.all([
          clickUpRepo.findActiveCases(country),
          countByStatus('REGISTERED'),
          countByStatus('INCOMPLETE_REGISTER'),
          publicationRepo.countByChannel(filters),
          encuadreRepo.countAttended(filters),
        ]);

      const busquedaCount   = activeCases.filter(c => c.status === 'BUSQUEDA').length;
      const reemplazoCount  = activeCases.filter(c => c.status === 'REEMPLAZO' || c.status === 'REEMPLAZOS').length;
      const totalPubs       = publicationsByChannel.reduce((s, p) => s + p.count, 0);

      res.json({
        success: true,
        data: {
          activeCasesCount:           activeCases.length,
          busquedaCount,
          reemplazoCount,
          postulantesInTalentumCount: postulantesCount,
          candidatosEnProgresoCount:  candidatosCount,
          totalPubs,
          pubChartData:               publicationsByChannel.map(p => ({ name: p.channel ?? 'Sin canal', value: p.count })),
          cantidadEncuadres:          encuadresCount,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/dashboard/cases/:caseNumber?startDate=&endDate=
   * Métricas detalhadas de um caso específico.
   */
  async getCaseMetrics(req: Request, res: Response): Promise<void> {
    try {
      const caseNumber = parseInt(req.params.caseNumber);
      if (isNaN(caseNumber)) {
        res.status(400).json({ success: false, error: 'caseNumber inválido' });
        return;
      }
      const { startDate, endDate } = req.query as Record<string, string>;
      const filters = { startDate, endDate };

      const clickUpRepo         = new ClickUpCaseRepository();
      const encuadreRepo        = new EncuadreRepository();
      const workerAppRepo       = new WorkerApplicationRepository();
      const publicationRepo     = new PublicationRepository();
      const jobPostingRepo      = new JobPostingARRepository();

      const jobPosting = await jobPostingRepo.findByCaseNumber(caseNumber);
      if (!jobPosting) {
        res.status(404).json({ success: false, error: `Caso ${caseNumber} não encontrado em job_postings` });
        return;
      }

      const [clickUpCase, postuladosCount, candidatosCount, invitedAttended, resultados, publicationsByChannel, publicacionesList] =
        await Promise.all([
          clickUpRepo.findByCaseNumber(caseNumber),
          workerAppRepo.countByJobPosting(jobPosting.id, filters),
          encuadreRepo.countCandidatesByJobPosting(jobPosting.id, filters),
          encuadreRepo.countInvitedAndAttended(jobPosting.id, filters),
          encuadreRepo.countByResultado(jobPosting.id, filters),
          publicationRepo.countByChannelForJobPosting(jobPosting.id, filters),
          publicationRepo.findByJobPosting(jobPosting.id, { ...filters, orderBy: 'published_at DESC' }),
        ]);

      const { invitados, asistentes } = invitedAttended;
      const selCount = resultados.find(r => r.resultado === 'SELECCIONADO')?.count ?? 0;
      const remCount = resultados.find(r => r.resultado === 'REEMPLAZO')?.count ?? 0;

      res.json({
        success: true,
        data: {
          clickUpInfo:        clickUpCase,
          postuladosCount,
          candidatosCount,
          invitados,
          asistentes,
          asistenciaPct:      invitados > 0 ? Math.round((asistentes / invitados) * 100) : 0,
          seleccionadosCount: selCount,
          reemplazosCount:    remCount,
          pubChartData:       publicationsByChannel.map(p => ({ name: p.channel ?? 'Sin canal', value: p.count })),
          publicacionesList:  publicacionesList.map(p => ({
            fecha:        p.publishedAt?.toISOString().split('T')[0] ?? 'Sin fecha',
            canal:        p.channel,
            publicadoPor: p.recruiterName,
            descripcion:  p.observations ?? '',
          })),
          resultadosChartData: resultados.map(r => ({ name: r.resultado, value: r.count })),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/dashboard/zones?country=AR
   * Distribuição de casos por zona geográfica.
   */
  async getZoneMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { country = 'AR' } = req.query as Record<string, string>;
      const clickUpRepo = new ClickUpCaseRepository();
      const zonesDistribution = await clickUpRepo.countByZone(country);

      const total      = zonesDistribution.reduce((s, z) => s + z.count, 0);
      const nullCount  = zonesDistribution.find(z => z.zone === null)?.count ?? 0;
      const validTotal = total - nullCount;
      const maxCount   = Math.max(0, ...zonesDistribution.filter(z => z.zone !== null).map(z => z.count));

      const zonas = zonesDistribution
        .filter(z => z.zone !== null)
        .map(z => ({
          name:       z.zone,
          count:      z.count,
          pct:        validTotal > 0 ? Math.round((z.count / validTotal) * 100) : 0,
          pctOfTotal: total > 0 ? Math.round((z.count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      res.json({
        success: true,
        data: {
          zonas,
          nullCount,
          nullPct:    total > 0 ? ((nullCount / total) * 100).toFixed(1) : '0.0',
          total,
          validTotal,
          maxCount,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  /**
   * GET /analytics/dashboard/reemplazos?country=AR
   * Seleccionados e reemplazos por caso, com última publicação e candidatos.
   */
  async getReemplazosMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { country = 'AR' } = req.query as Record<string, string>;

      const encuadreRepo   = new EncuadreRepository();
      const publicationRepo = new PublicationRepository();
      const workerAppRepo  = new WorkerApplicationRepository();

      const [reemplazosCounts, lastPublications, candidatosCounts, postuladosCounts] =
        await Promise.all([
          encuadreRepo.countSelAndRemByCaseNumber(country),
          publicationRepo.findLastPublicationPerCase(country),
          workerAppRepo.countCandidatesByCaseNumber(country),
          workerAppRepo.countPostuladosByCaseNumber(country),
        ]);

      const lastPubDates:    Record<string, string> = {};
      const lastPubChannels: Record<string, string | null> = {};
      for (const p of lastPublications) {
        const key = String(p.caseNumber);
        lastPubDates[key]    = p.timeAgo;
        lastPubChannels[key] = p.channel;
      }

      res.json({
        success: true,
        data: {
          reemplazosCounts,
          lastPubDates,
          lastPubChannels,
          candidatosCounts,
          postuladosCounts,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}
