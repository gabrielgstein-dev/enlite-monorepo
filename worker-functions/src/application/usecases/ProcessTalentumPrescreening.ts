// =====================
// ProcessTalentumPrescreening — orquestra a persistência do webhook incremental do Talentum.
//
// Fluxo (repetido a cada POST incremental):
//   1. Tenta resolver worker_id: email → phoneNumber → cuil
//   2. Tenta resolver job_posting_id: prescreening.name (ILIKE em job_postings.title)
//   3. Upsert em talentum_prescreenings (COALESCE nas FKs)
//   4. Para cada registerQuestion: upsert question + response (source='register')
//   5. Para cada response.state: upsert question + response (source='prescreening')
//
// Repositórios injetados via construtor para testabilidade sem banco.
// =====================

import { Pool } from 'pg';
import { TalentumPrescreeningRepository } from '../../infrastructure/repositories/TalentumPrescreeningRepository';
import { TalentumPrescreeningPayloadParsed } from '../../interfaces/validators/talentumPrescreeningSchema';
import { TalentumResponseSource } from '../../domain/entities/TalentumPrescreening';

export interface ProcessTalentumPrescreeningResult {
  prescreeningId: string;
  talentumPrescreeningId: string;
  workerId: string | null;
  jobPostingId: string | null;
  resolved: {
    worker: boolean;
    jobPosting: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────
// IWorkerLookup — porta mínima para o use case localizar um worker
// (não acoplamos ao WorkerRepository concreto para manter testabilidade)
// ─────────────────────────────────────────────────────────────────
export interface IWorkerLookup {
  findByEmail(email: string): Promise<{ getValue(): { id: string } | null } | { isSuccess: boolean; getValue(): { id: string } | null }>;
  findByPhone(phone: string): Promise<{ getValue(): { id: string } | null } | { isSuccess: boolean; getValue(): { id: string } | null }>;
  findByCuit(cuit: string): Promise<{ getValue(): { id: string } | null } | { isSuccess: boolean; getValue(): { id: string } | null }>;
}

// ─────────────────────────────────────────────────────────────────
// IJobPostingLookup — porta mínima para localizar uma job_posting por nome
// ─────────────────────────────────────────────────────────────────
export interface IJobPostingLookup {
  findByTitleILike(name: string): Promise<{ id: string } | null>;
}

export class ProcessTalentumPrescreening {
  constructor(
    private readonly prescreeningRepo: TalentumPrescreeningRepository,
    private readonly workerLookup: IWorkerLookup,
    private readonly jobPostingLookup: IJobPostingLookup,
  ) {}

  async execute(
    payload: TalentumPrescreeningPayloadParsed,
  ): Promise<ProcessTalentumPrescreeningResult> {
    // ── 1. Resolver worker_id: email → phoneNumber → cuil ──────────
    const workerId = await this.resolveWorkerId(payload);

    // ── 2. Resolver job_posting_id por ILIKE em title ───────────────
    const jobPostingId = await this.resolveJobPostingId(payload.prescreening.name);

    // ── 3. Upsert talentum_prescreenings ────────────────────────────
    const { prescreening } = await this.prescreeningRepo.upsertPrescreening({
      talentumPrescreeningId: payload.prescreening.id,
      talentumProfileId:      payload.profile.id,
      workerId,
      jobPostingId,
      jobCaseName: payload.prescreening.name,
      status:      payload.prescreening.status,
    });

    // ── 4. registerQuestions (source = 'register') ──────────────────
    await this.upsertQuestions(
      prescreening.id,
      payload.profile.registerQuestions,
      'register',
    );

    // ── 5. response.state (source = 'prescreening') ─────────────────
    await this.upsertQuestions(
      prescreening.id,
      payload.response.state,
      'prescreening',
    );

    return {
      prescreeningId:         prescreening.id,
      talentumPrescreeningId: prescreening.talentumPrescreeningId,
      workerId:               prescreening.workerId,
      jobPostingId:           prescreening.jobPostingId,
      resolved: {
        worker:     prescreening.workerId !== null,
        jobPosting: prescreening.jobPostingId !== null,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // resolveWorkerId — tenta email → phone → cuil; null se não encontrado
  // ─────────────────────────────────────────────────────────────────
  private async resolveWorkerId(
    payload: TalentumPrescreeningPayloadParsed,
  ): Promise<string | null> {
    const { email, phoneNumber, cuil } = payload.profile;

    const byEmail = await this.workerLookup.findByEmail(email);
    const emailWorker = this.extractId(byEmail);
    if (emailWorker) return emailWorker;

    const byPhone = await this.workerLookup.findByPhone(phoneNumber);
    const phoneWorker = this.extractId(byPhone);
    if (phoneWorker) return phoneWorker;

    const byCuil = await this.workerLookup.findByCuit(cuil);
    const cuilWorker = this.extractId(byCuil);
    if (cuilWorker) return cuilWorker;

    return null;
  }

  // Extrai id do Result genérico do WorkerRepository (isSuccess + getValue())
  private extractId(
    result: { getValue(): { id: string } | null } | { isSuccess: boolean; getValue(): { id: string } | null },
  ): string | null {
    if ('isSuccess' in result && !result.isSuccess) return null;
    const val = result.getValue();
    return val?.id ?? null;
  }

  // ─────────────────────────────────────────────────────────────────
  // resolveJobPostingId — ILIKE em title; null se não encontrado
  // ─────────────────────────────────────────────────────────────────
  private async resolveJobPostingId(caseName: string): Promise<string | null> {
    try {
      const posting = await this.jobPostingLookup.findByTitleILike(caseName);
      return posting?.id ?? null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // upsertQuestions — upsert question + response para cada item da lista
  // ─────────────────────────────────────────────────────────────────
  private async upsertQuestions(
    prescreeningId: string,
    items: { questionId: string; question: string; answer: string; responseType: string }[],
    source: TalentumResponseSource,
  ): Promise<void> {
    for (const item of items) {
      const { question } = await this.prescreeningRepo.upsertQuestion({
        questionId:   item.questionId,
        question:     item.question,
        responseType: item.responseType,
      });

      await this.prescreeningRepo.upsertResponse({
        prescreeningId,
        questionId:     question.id,
        answer:         item.answer || null,
        responseSource: source,
      });
    }
  }
}
