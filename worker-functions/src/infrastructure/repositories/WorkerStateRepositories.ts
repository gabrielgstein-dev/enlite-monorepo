import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { WorkerLocation, CreateWorkerLocationDTO } from '../../domain/entities/OperationalEntities';
import { ApplicationFunnelStage } from '../../domain/entities/WorkerJobApplication';

// =====================================================
// WorkerApplicationRepository
// Gerencia vínculos entre workers e job postings (pre-screenings do Talent Search)
// Migration 011 cria a tabela worker_job_applications
// Migration 019 adiciona a coluna source
// =====================================================
export class WorkerApplicationRepository {
  private pool: Pool;
  private _hasSourceColumn: boolean | null = null;

  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  private async hasSourceColumn(): Promise<boolean> {
    if (this._hasSourceColumn !== null) return this._hasSourceColumn;

    const result = await this.pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'worker_job_applications'
         AND column_name = 'source'
       ) as exists`,
    );
    this._hasSourceColumn = result.rows[0].exists as boolean;
    return this._hasSourceColumn;
  }

  async upsert(
    workerId: string,
    jobPostingId: string,
    source = 'talent_search',
    funnelStage: ApplicationFunnelStage = 'INITIATED',
  ): Promise<{ created: boolean }> {
    const hasSource = await this.hasSourceColumn();

    try {
      const result = hasSource
        ? await this.pool.query(
            `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage, source)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (worker_id, job_posting_id) DO NOTHING
             RETURNING id`,
            [workerId, jobPostingId, funnelStage, source],
          )
        : await this.pool.query(
            `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage)
             VALUES ($1, $2, $3)
             ON CONFLICT (worker_id, job_posting_id) DO NOTHING
             RETURNING id`,
            [workerId, jobPostingId, funnelStage],
          );

      return { created: (result.rowCount ?? 0) > 0 };
    } catch (err) {
      console.error(`[WorkerApplicationRepo.upsert] ERROR | ${(err as Error).message} | workerId: ${workerId} | jobPostingId: ${jobPostingId}`);
      throw err;
    }
  }

  async findByWorkerId(
    workerId: string,
  ): Promise<{ jobPostingId: string; funnelStage: string; source: string | null }[]> {
    const result = await this.pool.query(
      `SELECT job_posting_id, application_funnel_stage, source
       FROM worker_job_applications
       WHERE worker_id = $1
       ORDER BY created_at DESC`,
      [workerId],
    );
    return result.rows.map(r => ({
      jobPostingId: r.job_posting_id,
      funnelStage: r.application_funnel_stage,
      source: r.source ?? null,
    }));
  }

  async countByJobPosting(jobPostingId: string, filters: { startDate?: string; endDate?: string } = {}): Promise<number> {
    const conditions: string[] = ['job_posting_id = $1'];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`created_at >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`created_at <= $${idx++}`); values.push(filters.endDate); }

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM worker_job_applications WHERE ${conditions.join(' AND ')}`,
      values
    );
    return (result.rows[0]?.count as number) ?? 0;
  }

  async countCandidatesByCaseNumber(country: string = 'AR'): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT jp.case_number, COUNT(DISTINCT wja.worker_id)::int AS count
       FROM worker_job_applications wja
       JOIN job_postings jp ON wja.job_posting_id = jp.id
       JOIN workers w ON wja.worker_id = w.id
       WHERE jp.country = $1
         AND jp.deleted_at IS NULL
         AND w.status = 'INCOMPLETE_REGISTER'
       GROUP BY jp.case_number`,
      [country]
    );
    const map: Record<string, number> = {};
    for (const r of result.rows) {
      map[String(r.case_number)] = r.count as number;
    }
    return map;
  }

  async countPostuladosByCaseNumber(country: string = 'AR'): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT jp.case_number, COUNT(DISTINCT wja.worker_id)::int AS count
       FROM worker_job_applications wja
       JOIN job_postings jp ON wja.job_posting_id = jp.id
       JOIN workers w ON wja.worker_id = w.id
       WHERE jp.country = $1
         AND jp.deleted_at IS NULL
         AND w.status = 'REGISTERED'
       GROUP BY jp.case_number`,
      [country]
    );
    const map: Record<string, number> = {};
    for (const r of result.rows) {
      map[String(r.case_number)] = r.count as number;
    }
    return map;
  }
}


// =====================================================
// WorkerLocationRepository
// Gerencia localização e endereço dos workers (migration 034)
// =====================================================
export class WorkerLocationRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreateWorkerLocationDTO): Promise<{ location: WorkerLocation; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO worker_locations (
         worker_id, address, city, state, country, postal_code,
         work_zone, interest_zone, data_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (worker_id) DO UPDATE SET
         address = EXCLUDED.address,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         country = EXCLUDED.country,
         postal_code = EXCLUDED.postal_code,
         work_zone = EXCLUDED.work_zone,
         interest_zone = EXCLUDED.interest_zone,
         data_source = EXCLUDED.data_source
       RETURNING *, (xmax = 0) AS inserted`,
      [
        dto.workerId,
        dto.address ?? null,
        dto.city ?? null,
        dto.state ?? null,
        dto.country ?? 'AR',
        dto.postalCode ?? null,
        dto.workZone ?? null,
        dto.interestZone ?? null,
        dto.dataSource ?? null,
      ]
    );

    return {
      location: this.mapRow(result.rows[0]),
      created: result.rows[0].inserted as boolean,
    };
  }

  async findByWorkerId(workerId: string): Promise<WorkerLocation | null> {
    const result = await this.pool.query(
      'SELECT * FROM worker_locations WHERE worker_id = $1',
      [workerId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByCity(city: string, options: { limit?: number; offset?: number } = {}): Promise<WorkerLocation[]> {
    const result = await this.pool.query(
      `SELECT * FROM worker_locations WHERE city ILIKE $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [`%${city}%`, options.limit ?? 50, options.offset ?? 0]
    );
    return result.rows.map(this.mapRow);
  }

  async findByWorkZone(workZone: string, options: { limit?: number; offset?: number } = {}): Promise<WorkerLocation[]> {
    const result = await this.pool.query(
      `SELECT * FROM worker_locations WHERE work_zone ILIKE $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [`%${workZone}%`, options.limit ?? 50, options.offset ?? 0]
    );
    return result.rows.map(this.mapRow);
  }

  async deleteByWorkerId(workerId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM worker_locations WHERE worker_id = $1',
      [workerId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private mapRow(row: Record<string, unknown>): WorkerLocation {
    return {
      id: row.id as string,
      workerId: row.worker_id as string,
      address: row.address as string | null,
      city: row.city as string | null,
      state: row.state as string | null,
      country: row.country as string,
      postalCode: row.postal_code as string | null,
      workZone: row.work_zone as string | null,
      interestZone: row.interest_zone as string | null,
      dataSource: row.data_source as string | null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
