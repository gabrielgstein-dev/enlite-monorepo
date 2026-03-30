/**
 * EncuadreController
 *
 * GET  /api/workers/:id/encuadres          — histórico de entrevistas do worker
 * GET  /api/workers/:id/cases              — casos pelos quais passou (resumo)
 * GET  /api/cases/:caseNumber/encuadres    — encuadres de um caso
 * GET  /api/cases/:caseNumber/workers      — workers de um caso
 *
 * GET  /api/workers/funnel                 — dashboard do funil (contagem por stage)
 * GET  /api/workers/funnel/:stage          — lista workers de uma etapa do funil
 * PUT  /api/workers/:id/funnel-stage       — atualiza etapa do funil manualmente
 * PUT  /api/workers/:id/occupation         — atualiza ocupação do worker
 *
 * PUT  /api/workers/:id/doc-expiry         — atualiza datas de vencimento
 * GET  /api/workers/docs-expiring          — workers com documentos vencidos/vencendo
 */

import { Request, Response } from 'express';
import { EncuadreRepository } from '../../infrastructure/repositories/EncuadreRepository';
import {
  JobPostingARRepository,
  WorkerFunnelRepository,
  DocExpiryRepository,
} from '../../infrastructure/repositories/OperationalRepositories';
import { FunnelStage, WorkerOccupation } from '../../domain/entities/OperationalEntities';

export class EncuadreController {
  private encuadreRepo = new EncuadreRepository();
  private jobPostingRepo = new JobPostingARRepository();
  private funnelRepo = new WorkerFunnelRepository();
  private docExpiryRepo = new DocExpiryRepository();

  // ================================================
  // Histórico de entrevistas
  // ================================================

  async getWorkerEncuadres(req: Request, res: Response): Promise<void> {
    try {
      const encuadres = await this.encuadreRepo.findByWorkerId(req.params.id);
      res.status(200).json({
        success: true,
        data: encuadres.map(e => ({
          id: e.id,
          jobPostingId: e.jobPostingId,
          caseNumber: (e as any).case_number ?? null,
          patientName: (e as any).patient_name ?? null,
          resultado: e.resultado,
          interviewDate: e.interviewDate,
          recruitmentDate: e.recruitmentDate,
          recruiterName: e.recruiterName,
          acceptsCase: e.acceptsCase,
          rejectionReason: e.rejectionReason,
          redireccionamiento: e.redireccionamiento,
          llmInterestLevel: e.llmInterestLevel,
          llmFollowUpPotential: e.llmFollowUpPotential,
          llmAvailabilityNotes: e.llmAvailabilityNotes,
          llmRealRejectionReason: e.llmRealRejectionReason,
          llmExtractedExperience: e.llmExtractedExperience,
          createdAt: e.createdAt,
        })),
        total: encuadres.length,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getWorkerCases(req: Request, res: Response): Promise<void> {
    try {
      const encuadres = await this.encuadreRepo.findByWorkerId(req.params.id);

      // Agrupa por job_posting_id — pega o último encuadre de cada caso
      const caseMap = new Map<string, typeof encuadres[0]>();
      const countByCase = new Map<string, number>();

      for (const e of encuadres) {
        const key = e.jobPostingId ?? `raw_${e.workerRawName}`;
        countByCase.set(key, (countByCase.get(key) ?? 0) + 1);
        if (!caseMap.has(key) || (e.interviewDate && (!caseMap.get(key)!.interviewDate || e.interviewDate > caseMap.get(key)!.interviewDate!))) {
          caseMap.set(key, e);
        }
      }

      const cases = Array.from(caseMap.entries()).map(([key, e]) => ({
        jobPostingId: e.jobPostingId,
        caseNumber: (e as any).case_number ?? null,
        patientName: (e as any).patient_name ?? null,
        lastResultado: e.resultado,
        lastInterviewDate: e.interviewDate,
        totalEncuadres: countByCase.get(key) ?? 1,
        status: classifyWorkerCaseStatus(e.resultado),
        llmInterestLevel: e.llmInterestLevel,
        llmFollowUpPotential: e.llmFollowUpPotential,
      }));

      res.status(200).json({
        success: true,
        data: cases,
        summary: {
          total: cases.length,
          selected: cases.filter(c => c.lastResultado === 'SELECCIONADO').length,
          rejected: cases.filter(c => c.lastResultado === 'RECHAZADO').length,
          notInterested: cases.filter(c => c.lastResultado === 'AT_NO_ACEPTA').length,
          inProgress: cases.filter(c => ['PENDIENTE','REPROGRAMAR'].includes(c.lastResultado ?? '')).length,
          withFollowUpPotential: cases.filter(c => c.llmFollowUpPotential).length,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getCaseEncuadres(req: Request, res: Response): Promise<void> {
    try {
      const caseNumber = parseInt(req.params.caseNumber);
      if (isNaN(caseNumber)) { res.status(400).json({ success: false, error: 'caseNumber inválido' }); return; }

      const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
      if (!jp) { res.status(404).json({ success: false, error: `Caso ${caseNumber} não encontrado` }); return; }

      const encuadres = await this.encuadreRepo.findByJobPostingId(jp.id);

      res.status(200).json({
        success: true,
        data: {
          caseNumber,
          jobPostingId: jp.id,
          encuadres: encuadres.map(e => ({
            id: e.id,
            workerId: e.workerId,
            workerRawName: e.workerRawName,
            workerRawPhone: e.workerRawPhone,
            resultado: e.resultado,
            recruitmentDate: e.recruitmentDate,
            interviewDate: e.interviewDate,
            attended: e.attended,
            acceptsCase: e.acceptsCase,
            rejectionReason: e.rejectionReason,
            redireccionamiento: e.redireccionamiento,
            llmInterestLevel: e.llmInterestLevel,
            llmExtractedExperience: e.llmExtractedExperience,
            llmFollowUpPotential: e.llmFollowUpPotential,
            llmRealRejectionReason: e.llmRealRejectionReason,
            llmAvailabilityNotes: e.llmAvailabilityNotes,
          })),
          summary: {
            total: encuadres.length,
            byResultado: groupByResultado(encuadres),
            highInterest: encuadres.filter(e => e.llmInterestLevel === 'ALTO').length,
            followUpPotential: encuadres.filter(e => e.llmFollowUpPotential).length,
          },
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getCaseWorkers(req: Request, res: Response): Promise<void> {
    try {
      const caseNumber = parseInt(req.params.caseNumber);
      if (isNaN(caseNumber)) { res.status(400).json({ success: false, error: 'caseNumber inválido' }); return; }

      const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
      if (!jp) { res.status(404).json({ success: false, error: `Caso ${caseNumber} não encontrado` }); return; }

      const encuadres = await this.encuadreRepo.findByJobPostingId(jp.id);

      const workerMap = new Map<string, { workerId: string | null; rawName: string | null; rawPhone: string | null; encuadres: typeof encuadres }>();
      for (const e of encuadres) {
        const key = e.workerId ?? e.workerRawPhone ?? e.workerRawName ?? e.id;
        if (!workerMap.has(key)) workerMap.set(key, { workerId: e.workerId, rawName: e.workerRawName, rawPhone: e.workerRawPhone, encuadres: [] });
        workerMap.get(key)!.encuadres.push(e);
      }

      const workers = Array.from(workerMap.values()).map(w => {
        const last = w.encuadres[0];
        return {
          workerId: w.workerId,
          rawName: w.rawName,
          rawPhone: w.rawPhone,
          totalEncuadres: w.encuadres.length,
          lastResultado: last.resultado,
          lastInterviewDate: last.interviewDate,
          status: classifyWorkerCaseStatus(last.resultado),
          llmInterestLevel: last.llmInterestLevel,
          llmFollowUpPotential: last.llmFollowUpPotential,
          llmExtractedExperience: last.llmExtractedExperience,
        };
      });

      res.status(200).json({
        success: true,
        data: workers,
        summary: {
          totalWorkers: workers.length,
          selected: workers.filter(w => w.status === 'SELECCIONADO').length,
          rejected: workers.filter(w => w.status === 'RECHAZADO').length,
          notInterested: workers.filter(w => w.status === 'NAO_INTERESSADO').length,
          inProgress: workers.filter(w => w.status === 'EM_ANDAMENTO').length,
          withFollowUpPotential: workers.filter(w => w.llmFollowUpPotential).length,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  // ================================================
  // Funnel Stage — etapas do funil de recrutamento
  // ================================================

  async getFunnelDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const counts = await this.funnelRepo.countByFunnelStage();
      res.status(200).json({
        success: true,
        data: {
          PRE_TALENTUM: { count: counts.PRE_TALENTUM, label: 'Pré-Talentum (leads a trabalhar)' },
          TALENTUM:     { count: counts.TALENTUM,     label: 'Talentum completo' },
          QUALIFIED:    { count: counts.QUALIFIED,    label: 'Qualificados (prontos para alocar)' },
          BLACKLIST:    { count: counts.BLACKLIST,    label: 'Blacklist' },
          total: Object.values(counts).reduce((s, n) => s + n, 0),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getWorkersByFunnelStage(req: Request, res: Response): Promise<void> {
    try {
      const stage = req.params.stage?.toUpperCase() as FunnelStage;
      const validStages: FunnelStage[] = ['PRE_TALENTUM', 'TALENTUM', 'QUALIFIED', 'BLACKLIST'];

      if (!validStages.includes(stage)) {
        res.status(400).json({
          success: false,
          error: `Stage inválido. Use: ${validStages.join(', ')}`,
        });
        return;
      }

      const limit  = Math.min(parseInt(String(req.query.limit  ?? '50')), 200);
      const offset = parseInt(String(req.query.offset ?? '0'));
      const occupation = req.query.occupation as WorkerOccupation | undefined;

      const workers = await this.funnelRepo.listByFunnelStage(stage, { limit, offset, occupation });

      res.status(200).json({
        success: true,
        data: workers,
        pagination: { limit, offset, count: workers.length },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async updateFunnelStage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { funnelStage } = req.body;

      const validStages: FunnelStage[] = ['PRE_TALENTUM', 'TALENTUM', 'QUALIFIED', 'BLACKLIST'];
      if (!validStages.includes(funnelStage)) {
        res.status(400).json({ success: false, error: `funnelStage inválido. Use: ${validStages.join(', ')}` });
        return;
      }

      const changedByUid = (req as any).user?.uid ?? undefined;
      await this.funnelRepo.updateFunnelStage(id, funnelStage, changedByUid);
      res.status(200).json({ success: true, data: { workerId: id, funnelStage } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async updateOccupation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { occupation } = req.body;

      const validOccupations: WorkerOccupation[] = ['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'];
      if (!validOccupations.includes(occupation)) {
        res.status(400).json({ success: false, error: `occupation inválido. Use: ${validOccupations.join(', ')}` });
        return;
      }

      const changedByUid = (req as any).user?.uid ?? undefined;
      await this.funnelRepo.updateOccupation(id, occupation, changedByUid);
      res.status(200).json({ success: true, data: { workerId: id, occupation } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  // ================================================
  // Vencimento de documentos
  // ================================================

  async updateDocExpiry(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { criminalRecordExpiry, insuranceExpiry, professionalRegExpiry } = req.body;

      await this.docExpiryRepo.update({
        workerId: id,
        criminalRecordExpiry: criminalRecordExpiry ? new Date(criminalRecordExpiry) : undefined,
        insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : undefined,
        professionalRegExpiry: professionalRegExpiry ? new Date(professionalRegExpiry) : undefined,
      });

      const updated = await this.docExpiryRepo.findByWorkerId(id);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getDocsExpiringSoon(_req: Request, res: Response): Promise<void> {
    try {
      const expiring = await this.docExpiryRepo.findExpiringSoon(30);
      res.status(200).json({
        success: true,
        data: expiring,
        total: expiring.length,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
}

// ------------------------------------------------
// Helpers
// ------------------------------------------------
function classifyWorkerCaseStatus(resultado: string | null): string {
  if (!resultado) return 'SEM_RESULTADO';
  if (resultado === 'SELECCIONADO') return 'SELECCIONADO';
  if (resultado === 'RECHAZADO') return 'RECHAZADO';
  if (resultado === 'AT_NO_ACEPTA') return 'NAO_INTERESSADO';
  if (resultado === 'BLACKLIST') return 'BLACKLIST';
  if (['PENDIENTE','REPROGRAMAR','REEMPLAZO'].includes(resultado)) return 'EM_ANDAMENTO';
  return 'OUTRO';
}

function groupByResultado(encuadres: { resultado: string | null }[]): Record<string, number> {
  return encuadres.reduce((acc, e) => {
    const key = e.resultado ?? 'SEM_RESULTADO';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
