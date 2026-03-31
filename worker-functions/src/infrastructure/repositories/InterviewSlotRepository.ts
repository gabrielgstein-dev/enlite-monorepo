import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  InterviewSlot,
  InterviewSlotStatus,
  CreateInterviewSlotsDTO,
} from '../../domain/entities/InterviewSlot';

export class InterviewSlotRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  /**
   * Insere múltiplos slots em batch para uma vaga.
   * Cada slot herda meetLink e notes do DTO pai, salvo se não fornecidos.
   */
  async createSlots(dto: CreateInterviewSlotsDTO): Promise<InterviewSlot[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const created: InterviewSlot[] = [];

      for (const slot of dto.slots) {
        const result = await client.query<Record<string, unknown>>(
          `INSERT INTO interview_slots
             (job_posting_id, coordinator_id, slot_date, slot_time, slot_end_time,
              meet_link, max_capacity, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            dto.jobPostingId,
            dto.coordinatorId ?? null,
            slot.date,
            slot.startTime,
            slot.endTime,
            dto.meetLink ?? null,
            slot.maxCapacity ?? 1,
            dto.notes ?? null,
          ],
        );
        created.push(this.mapRow(result.rows[0]));
      }

      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Lista slots com status AVAILABLE para uma vaga. */
  async getAvailableSlots(jobPostingId: string): Promise<InterviewSlot[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM interview_slots
       WHERE job_posting_id = $1 AND status = 'AVAILABLE'
       ORDER BY slot_date ASC, slot_time ASC`,
      [jobPostingId],
    );
    return result.rows.map(r => this.mapRow(r));
  }

  /** Lista todos os slots de uma vaga, independente do status. */
  async getAllSlots(jobPostingId: string): Promise<InterviewSlot[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM interview_slots
       WHERE job_posting_id = $1
       ORDER BY slot_date ASC, slot_time ASC`,
      [jobPostingId],
    );
    return result.rows.map(r => this.mapRow(r));
  }

  /** Busca um slot pelo ID. Retorna null se não encontrado. */
  async getSlotById(slotId: string): Promise<InterviewSlot | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM interview_slots WHERE id = $1`,
      [slotId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Reserva um slot para um encuadre usando locking otimista.
   *
   * Estratégia:
   *   1. UPDATE interview_slots com condição booked_count < max_capacity
   *      garante que apenas um cliente "ganha" a última vaga disponível.
   *   2. Se rowCount = 0, o slot já está cheio ou não existe → rollback.
   *   3. Atualiza o encuadre com as informações do slot reservado.
   */
  async bookSlot(
    slotId: string,
    encuadreId: string,
    meetLink: string | null,
  ): Promise<{ success: boolean; slot: InterviewSlot | null }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Locking otimista: incrementa booked_count apenas se ainda há vagas
      const slotResult = await client.query<Record<string, unknown>>(
        `UPDATE interview_slots
         SET booked_count = booked_count + 1
         WHERE id = $1
           AND booked_count < max_capacity
           AND status = 'AVAILABLE'
         RETURNING *`,
        [slotId],
      );

      if (slotResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return { success: false, slot: null };
      }

      const slot = this.mapRow(slotResult.rows[0]);

      // Atualiza o encuadre com as informações da entrevista agendada
      await client.query(
        `UPDATE encuadres
         SET interview_slot_id = $1,
             interview_date     = $2,
             interview_time     = $3,
             meet_link          = COALESCE($4, meet_link),
             updated_at         = NOW()
         WHERE id = $5`,
        [slotId, slot.slotDate, slot.slotTime, meetLink, encuadreId],
      );

      await client.query('COMMIT');
      return { success: true, slot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancela um slot e limpa a referência nos encuadres vinculados.
   * Retorna true se o slot existia e foi cancelado.
   */
  async cancelSlot(slotId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE interview_slots
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = $1 AND status != 'CANCELLED'`,
        [slotId],
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      // Remove a referência ao slot nos encuadres vinculados
      await client.query(
        `UPDATE encuadres
         SET interview_slot_id = NULL, updated_at = NOW()
         WHERE interview_slot_id = $1`,
        [slotId],
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Converte uma linha do banco (snake_case) para a entidade (camelCase). */
  mapRow(row: Record<string, unknown>): InterviewSlot {
    // pg pode retornar colunas DATE como objetos Date (meia-noite UTC) ou como strings.
    // Normalizamos para "YYYY-MM-DD" usando componentes UTC para evitar problemas de fuso.
    const toDateStr = (v: unknown): string => {
      if (v instanceof Date) {
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, '0');
        const d = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return String(v).slice(0, 10);
    };

    return {
      id:            row.id as string,
      coordinatorId: row.coordinator_id as string | null,
      jobPostingId:  row.job_posting_id as string,
      slotDate:      toDateStr(row.slot_date),
      slotTime:      String(row.slot_time).slice(0, 5),
      slotEndTime:   String(row.slot_end_time).slice(0, 5),
      meetLink:      row.meet_link as string | null,
      maxCapacity:   Number(row.max_capacity),
      bookedCount:   Number(row.booked_count),
      status:        row.status as InterviewSlotStatus,
      notes:         row.notes as string | null,
      createdAt:     new Date(row.created_at as string),
      updatedAt:     new Date(row.updated_at as string),
    };
  }
}
