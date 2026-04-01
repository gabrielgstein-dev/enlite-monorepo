// =====================
// ProcessTalentumPrescreening — orquestra a persistência do webhook incremental do Talentum.
//
// Fluxo (repetido a cada POST incremental):
//   1. Tenta resolver worker_id: email → phoneNumber → cuil
//   2. Tenta resolver job_posting_id: prescreening.name (ILIKE em job_postings.title)
//   3. Upsert em talentum_prescreenings (COALESCE nas FKs)          ← pulado se dryRun
//   3.5. Se status === 'ANALYZED' AND worker_id resolvido AND job_posting_id resolvido
//        AND response.statusLabel presente:
//        upsert em worker_job_applications com o statusLabel e score do Talentum ← pulado se dryRun
//        Se transitou para QUALIFIED: insere domain_event + publica no Pub/Sub
//   4. Para cada registerQuestion: upsert question + response (source='register') ← pulado se dryRun
//   5. Para cada response.state: upsert question + response (source='prescreening') ← pulado se dryRun
//
// dryRun=true: resolve IDs mas não escreve nada no banco (usado pelo endpoint /webhooks-test).
// Repositórios injetados via construtor para testabilidade sem banco.
// =====================

import { Pool } from 'pg';
import { TalentumPrescreeningRepository } from '../../infrastructure/repositories/TalentumPrescreeningRepository';
import { TalentumPrescreeningPayloadParsed } from '../../interfaces/validators/talentumPrescreeningSchema';
import { TalentumResponseSource } from '../../domain/entities/TalentumPrescreening';
import { PubSubClient } from '../../infrastructure/events/PubSubClient';

export type WebhookEnvironment = 'production' | 'test';

export interface ProcessTalentumPrescreeningOptions {
  environment?: WebhookEnvironment;
  dryRun?: boolean;
}

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
    private readonly pool: Pool,
    private readonly pubsub: PubSubClient,
  ) {}

  async execute(
    payload: TalentumPrescreeningPayloadParsed,
    options?: ProcessTalentumPrescreeningOptions,
  ): Promise<ProcessTalentumPrescreeningResult> {
    const environment = options?.environment ?? 'production';
    const dryRun = options?.dryRun ?? false;

    // ── 1. Resolver worker_id: email → phoneNumber → cuil ──────────
    const workerId = await this.resolveWorkerId(payload);

    // ── 2. Resolver job_posting_id por ILIKE em title ───────────────
    const jobPostingId = await this.resolveJobPostingId(payload.prescreening.name);

    // ── dry-run: retorna resolução sem persistir nada no banco ───────
    if (dryRun) {
      return {
        prescreeningId:         payload.prescreening.id,
        talentumPrescreeningId: payload.prescreening.id,
        workerId,
        jobPostingId,
        resolved: {
          worker:     workerId !== null,
          jobPosting: jobPostingId !== null,
        },
      };
    }

    // ── 3. Upsert talentum_prescreenings ────────────────────────────
    const { prescreening } = await this.prescreeningRepo.upsertPrescreening({
      talentumPrescreeningId: payload.prescreening.id,
      talentumProfileId:      payload.profile.id,
      workerId,
      jobPostingId,
      jobCaseName: payload.prescreening.name,
      status:      payload.prescreening.status,
      environment,
    });

    // ── 3.5. Sincronizar worker_job_applications em TODOS os status ───
    //   INITIATED/IN_PROGRESS/COMPLETED → application_funnel_stage = prescreening.status
    //   ANALYZED + statusLabel          → application_funnel_stage = statusLabel (QUALIFIED/IN_DOUBT/NOT_QUALIFIED)
    //   ANALYZED sem statusLabel        → sem upsert (ANALYZED não é valor válido para a constraint)
    if (
      prescreening.workerId !== null &&
      prescreening.jobPostingId !== null
    ) {
      const funnelStage = payload.prescreening.status === 'ANALYZED' && payload.response.statusLabel
        ? payload.response.statusLabel
        : payload.prescreening.status;

      if (funnelStage !== 'ANALYZED') {
        await this.upsertApplicationAndEmitEvent(
          prescreening.workerId,
          prescreening.jobPostingId,
          funnelStage,
          payload.response.score ?? 0,
          dryRun,
        );
      }
    }

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
  // upsertApplicationAndEmitEvent — upsert worker_job_application
  // e, se transitou para QUALIFIED, emite domain event na mesma transação.
  // ─────────────────────────────────────────────────────────────────
  private async upsertApplicationAndEmitEvent(
    workerId: string,
    jobPostingId: string,
    statusLabel: string,
    matchScore: number,
    dryRun: boolean,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { previousStage } = await this.prescreeningRepo.upsertWorkerJobApplicationFromTalentum(
        { workerId, jobPostingId, applicationFunnelStage: statusLabel, matchScore },
        client,
      );

      let pendingEventId: string | null = null;

      if (statusLabel === 'QUALIFIED' && previousStage !== 'QUALIFIED') {
        const eventResult = await client.query(
          `INSERT INTO domain_events (event, payload)
           VALUES ('funnel_stage.qualified', $1::jsonb)
           RETURNING id`,
          [JSON.stringify({ workerId, jobPostingId })],
        );
        pendingEventId = eventResult.rows[0].id;
      }

      if (statusLabel === 'NOT_QUALIFIED' && previousStage !== 'NOT_QUALIFIED') {
        await client.query(
          `UPDATE encuadres
           SET resultado = 'RECHAZADO',
               rejection_reason_category = 'TALENTUM_NOT_QUALIFIED',
               updated_at = NOW()
           WHERE worker_id = $1
             AND job_posting_id = $2
             AND resultado IS NULL`,
          [workerId, jobPostingId],
        );

        const eventResult = await client.query(
          `INSERT INTO domain_events (event, payload)
           VALUES ('funnel_stage.not_qualified', $1::jsonb)
           RETURNING id`,
          [JSON.stringify({ workerId, jobPostingId })],
        );
        pendingEventId = eventResult.rows[0].id;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Publish Pub/Sub APÓS commit e release — se falhar, safety net reprocessa via polling
    if (pendingEventId) {
      try {
        await this.pubsub.publish('domain-events', { eventId: pendingEventId });
      } catch (pubsubErr) {
        console.error('[ProcessTalentumPrescreening] Pub/Sub publish failed (data committed, safety net will retry):', (pubsubErr as Error)?.message ?? pubsubErr);
      }
    }
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

    // cuil é opcional no payload — pula a busca se ausente
    if (cuil) {
      const byCuil = await this.workerLookup.findByCuit(cuil);
      const cuilWorker = this.extractId(byCuil);
      if (cuilWorker) return cuilWorker;
    }

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
    items: { questionId: string; question: string; answer: string; responseType?: string }[],
    source: TalentumResponseSource,
  ): Promise<void> {
    for (const item of items) {
      const { question } = await this.prescreeningRepo.upsertQuestion({
        questionId:   item.questionId,
        question:     item.question,
        responseType: item.responseType ?? '',
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
