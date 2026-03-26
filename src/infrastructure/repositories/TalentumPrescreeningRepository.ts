import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  TalentumPrescreening,
  TalentumQuestion,
  TalentumPrescreeningResponse,
  UpsertTalentumPrescreeningDTO,
  UpsertTalentumQuestionDTO,
  UpsertTalentumResponseDTO,
} from '../../domain/entities/TalentumPrescreening';

export class TalentumPrescreeningRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  // ─────────────────────────────────────────────────────────────────
  // upsertPrescreening
  //   ON CONFLICT (talentum_prescreening_id):
  //     status         → sempre sobrescreve (INITIATED → IN_PROGRESS → COMPLETED)
  //     worker_id      → COALESCE: preenche se era null; não regride para null em POSTs posteriores
  //     job_posting_id → COALESCE: idem
  //     updated_at     → sempre NOW()
  // ─────────────────────────────────────────────────────────────────
  async upsertPrescreening(
    dto: UpsertTalentumPrescreeningDTO,
  ): Promise<{ prescreening: TalentumPrescreening; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO talentum_prescreenings (
         talentum_prescreening_id,
         talentum_profile_id,
         worker_id,
         job_posting_id,
         job_case_name,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (talentum_prescreening_id) DO UPDATE SET
         status         = EXCLUDED.status,
         worker_id      = COALESCE(talentum_prescreenings.worker_id,      EXCLUDED.worker_id),
         job_posting_id = COALESCE(talentum_prescreenings.job_posting_id, EXCLUDED.job_posting_id),
         updated_at     = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [
        dto.talentumPrescreeningId,
        dto.talentumProfileId,
        dto.workerId,
        dto.jobPostingId,
        dto.jobCaseName,
        dto.status,
      ],
    );

    return {
      prescreening: this.mapPrescreeningRow(result.rows[0]),
      created: result.rows[0].inserted,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // upsertQuestion
  //   ON CONFLICT (question_id):
  //     question      → sempre sobrescreve (texto pode mudar no Talentum)
  //     response_type → sempre sobrescreve (idem)
  //     updated_at    → sempre NOW()
  // ─────────────────────────────────────────────────────────────────
  async upsertQuestion(
    dto: UpsertTalentumQuestionDTO,
  ): Promise<{ question: TalentumQuestion; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO talentum_questions (question_id, question, response_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (question_id) DO UPDATE SET
         question      = EXCLUDED.question,
         response_type = EXCLUDED.response_type,
         updated_at    = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [dto.questionId, dto.question, dto.responseType],
    );

    return {
      question: this.mapQuestionRow(result.rows[0]),
      created: result.rows[0].inserted,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // upsertResponse
  //   ON CONFLICT (prescreening_id, question_id, response_source):
  //     answer     → sempre sobrescreve (worker pode editar antes do COMPLETED)
  //     updated_at → sempre NOW()
  // ─────────────────────────────────────────────────────────────────
  async upsertResponse(
    dto: UpsertTalentumResponseDTO,
  ): Promise<{ response: TalentumPrescreeningResponse; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO talentum_prescreening_responses
         (prescreening_id, question_id, answer, response_source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (prescreening_id, question_id, response_source) DO UPDATE SET
         answer     = EXCLUDED.answer,
         updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [dto.prescreeningId, dto.questionId, dto.answer, dto.responseSource],
    );

    return {
      response: this.mapResponseRow(result.rows[0]),
      created: result.rows[0].inserted,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // findByTalentumId — busca por talentum_prescreening_id (chave externa)
  // ─────────────────────────────────────────────────────────────────
  async findByTalentumId(talentumPrescreeningId: string): Promise<TalentumPrescreening | null> {
    const result = await this.pool.query(
      `SELECT * FROM talentum_prescreenings WHERE talentum_prescreening_id = $1`,
      [talentumPrescreeningId],
    );
    return result.rows.length > 0 ? this.mapPrescreeningRow(result.rows[0]) : null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Row mappers (snake_case → camelCase)
  // ─────────────────────────────────────────────────────────────────

  private mapPrescreeningRow(row: any): TalentumPrescreening {
    return {
      id:                     row.id,
      talentumPrescreeningId: row.talentum_prescreening_id,
      talentumProfileId:      row.talentum_profile_id,
      workerId:               row.worker_id,
      jobPostingId:           row.job_posting_id,
      jobCaseName:            row.job_case_name,
      status:                 row.status,
      createdAt:              row.created_at,
      updatedAt:              row.updated_at,
    };
  }

  private mapQuestionRow(row: any): TalentumQuestion {
    return {
      id:           row.id,
      questionId:   row.question_id,
      question:     row.question,
      responseType: row.response_type,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
    };
  }

  private mapResponseRow(row: any): TalentumPrescreeningResponse {
    return {
      id:             row.id,
      prescreeningId: row.prescreening_id,
      questionId:     row.question_id,
      answer:         row.answer,
      responseSource: row.response_source,
      createdAt:      row.created_at,
      updatedAt:      row.updated_at,
    };
  }
}
