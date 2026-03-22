import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

export interface WorkerEmploymentHistoryDTO {
  workerId: string;
  hiredAt?: Date | null;
  terminatedAt?: Date | null;
  terminationReason?: string | null;
  employmentType?: 'ana_care' | 'enlite' | 'temporary' | 'contractor' | 'other';
  notes?: string | null;
}

export class WorkerEmploymentHistoryRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  /**
   * Cria ou atualiza histórico de emprego do worker
   * Se já existe um registro ativo (terminated_at IS NULL), atualiza
   * Caso contrário, cria um novo registro
   */
  async upsert(dto: WorkerEmploymentHistoryDTO): Promise<{ id: string; created: boolean }> {
    // Verificar se já existe um registro ativo
    const existing = await this.pool.query(
      `SELECT id FROM worker_employment_history
       WHERE worker_id = $1 AND terminated_at IS NULL
       LIMIT 1`,
      [dto.workerId]
    );

    if (existing.rows.length > 0) {
      // Atualizar registro existente
      const sets: string[] = [];
      const values: unknown[] = [existing.rows[0].id];
      let idx = 2;

      if (dto.hiredAt !== undefined) {
        sets.push(`hired_at = $${idx++}`);
        values.push(dto.hiredAt);
      }
      if (dto.terminatedAt !== undefined) {
        sets.push(`terminated_at = $${idx++}`);
        values.push(dto.terminatedAt);
      }
      if (dto.terminationReason !== undefined) {
        sets.push(`termination_reason = $${idx++}`);
        values.push(dto.terminationReason);
      }
      if (dto.employmentType !== undefined) {
        sets.push(`employment_type = $${idx++}`);
        values.push(dto.employmentType);
      }
      if (dto.notes !== undefined) {
        sets.push(`notes = $${idx++}`);
        values.push(dto.notes);
      }

      if (sets.length > 0) {
        await this.pool.query(
          `UPDATE worker_employment_history
           SET ${sets.join(', ')}, updated_at = NOW()
           WHERE id = $1`,
          values
        );
      }

      return { id: existing.rows[0].id, created: false };
    }

    // Criar novo registro
    const result = await this.pool.query(
      `INSERT INTO worker_employment_history (
         worker_id, hired_at, terminated_at, termination_reason, 
         employment_type, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        dto.workerId,
        dto.hiredAt || null,
        dto.terminatedAt || null,
        dto.terminationReason || null,
        dto.employmentType || null,
        dto.notes || null,
      ]
    );

    return { id: result.rows[0].id, created: true };
  }

  /**
   * Busca histórico de emprego de um worker
   */
  async findByWorkerId(workerId: string): Promise<Array<{
    id: string;
    hiredAt: Date | null;
    terminatedAt: Date | null;
    terminationReason: string | null;
    employmentType: string | null;
    notes: string | null;
    createdAt: Date;
  }>> {
    const result = await this.pool.query(
      `SELECT 
         id, hired_at, terminated_at, termination_reason,
         employment_type, notes, created_at
       FROM worker_employment_history
       WHERE worker_id = $1
       ORDER BY hired_at DESC NULLS LAST, created_at DESC`,
      [workerId]
    );

    return result.rows.map(r => ({
      id: r.id,
      hiredAt: r.hired_at,
      terminatedAt: r.terminated_at,
      terminationReason: r.termination_reason,
      employmentType: r.employment_type,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  /**
   * Busca o vínculo empregatício atual (ativo) de um worker
   */
  async findCurrentByWorkerId(workerId: string): Promise<{
    id: string;
    hiredAt: Date | null;
    employmentType: string | null;
    notes: string | null;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, hired_at, employment_type, notes
       FROM worker_employment_history
       WHERE worker_id = $1 AND terminated_at IS NULL
       ORDER BY hired_at DESC NULLS LAST
       LIMIT 1`,
      [workerId]
    );

    if (result.rows.length === 0) return null;

    const r = result.rows[0];
    return {
      id: r.id,
      hiredAt: r.hired_at,
      employmentType: r.employment_type,
      notes: r.notes,
    };
  }

  /**
   * Encerra vínculo empregatício ativo
   */
  async terminate(
    workerId: string,
    terminatedAt: Date,
    terminationReason?: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE worker_employment_history
       SET terminated_at = $2, 
           termination_reason = $3,
           updated_at = NOW()
       WHERE worker_id = $1 AND terminated_at IS NULL
       RETURNING id`,
      [workerId, terminatedAt, terminationReason || null]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }
}
