import { Pool } from 'pg';
import { IQuizResponseRepository } from '../../domain/repositories/IQuizResponseRepository';
import { WorkerQuizResponse, CreateQuizResponseDTO } from '../../domain/entities/WorkerQuizResponse';
import { Result } from '../../domain/shared/Result';
import { DatabaseConnection } from '../database/DatabaseConnection';

export class QuizResponseRepository implements IQuizResponseRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async create(data: CreateQuizResponseDTO): Promise<Result<WorkerQuizResponse>> {
    try {
      const query = `
        INSERT INTO worker_quiz_responses (worker_id, question_id, answer_id, section_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (worker_id, question_id) DO UPDATE
        SET answer_id = EXCLUDED.answer_id,
            section_id = EXCLUDED.section_id,
            updated_at = NOW()
        RETURNING id, worker_id as "workerId", question_id as "questionId", 
                  answer_id as "answerId", section_id as "sectionId",
                  created_at as "createdAt", updated_at as "updatedAt"
      `;

      const values = [
        data.workerId,
        data.questionId,
        data.answerId,
        data.sectionId || null,
      ];

      const result = await this.pool.query(query, values);
      return Result.ok<WorkerQuizResponse>(result.rows[0]);
    } catch (error: any) {
      return Result.fail<WorkerQuizResponse>(`Failed to create quiz response: ${error.message}`);
    }
  }

  async findByWorkerId(workerId: string): Promise<Result<WorkerQuizResponse[]>> {
    try {
      const query = `
        SELECT * FROM worker_quiz_responses
        WHERE worker_id = $1
        ORDER BY answered_at ASC
      `;

      const result = await this.pool.query(query, [workerId]);

      const responses: WorkerQuizResponse[] = result.rows.map(row => ({
        id: row.id,
        workerId: row.worker_id,
        sectionId: row.section_id,
        questionId: row.question_id,
        answerId: row.answer_id,
        createdAt: row.answered_at,
        updatedAt: row.answered_at,
      }));

      return Result.ok<WorkerQuizResponse[]>(responses);
    } catch (error: any) {
      return Result.fail<WorkerQuizResponse[]>(`Failed to find quiz responses: ${error.message}`);
    }
  }
}
