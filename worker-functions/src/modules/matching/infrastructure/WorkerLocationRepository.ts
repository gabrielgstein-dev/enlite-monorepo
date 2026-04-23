import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';

// WorkerLocation types inline (moved from OperationalEntities)
export interface WorkerLocation {
  id: string;
  workerId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  workZone: string | null;
  interestZone: string | null;
  dataSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkerLocationDTO {
  workerId: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  postalCode?: string | null;
  workZone?: string | null;
  interestZone?: string | null;
  dataSource?: string | null;
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
