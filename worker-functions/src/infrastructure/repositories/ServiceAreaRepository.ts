import { Pool } from 'pg';
import { IServiceAreaRepository } from '../../domain/repositories/IServiceAreaRepository';
import { WorkerServiceArea, CreateServiceAreaDTO } from '../../domain/entities/WorkerServiceArea';
import { Result } from '../../domain/shared/Result';
import { DatabaseConnection } from '../database/DatabaseConnection';

export class ServiceAreaRepository implements IServiceAreaRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async create(data: CreateServiceAreaDTO): Promise<Result<WorkerServiceArea>> {
    try {
      const query = `
        INSERT INTO worker_service_areas 
          (worker_id, address_line, city, state, postal_code, latitude, longitude, radius_km, address_complement, country)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        data.workerId,
        data.address,
        null, // city - não disponível no DTO
        null, // state - não disponível no DTO
        null, // postal_code - não disponível no DTO
        data.lat,
        data.lng,
        data.serviceRadiusKm,
        data.addressComplement || null,
        'BR',
      ];

      const result = await this.pool.query(query, values);
      const row = result.rows[0];

      const serviceArea: WorkerServiceArea = {
        id: row.id,
        workerId: row.worker_id,
        address: row.address_line,
        lat: parseFloat(row.latitude),
        lng: parseFloat(row.longitude),
        serviceRadiusKm: row.radius_km,
        addressComplement: row.address_complement,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return Result.ok<WorkerServiceArea>(serviceArea);
    } catch (error: any) {
      return Result.fail<WorkerServiceArea>(`Failed to create service area: ${error.message}`);
    }
  }

  async findByWorkerId(workerId: string): Promise<Result<WorkerServiceArea[]>> {
    try {
      const query = `
        SELECT * FROM worker_service_areas
        WHERE worker_id = $1
        ORDER BY created_at DESC
      `;

      const result = await this.pool.query(query, [workerId]);

      const serviceAreas: WorkerServiceArea[] = result.rows.map(row => ({
        id: row.id,
        workerId: row.worker_id,
        address: row.address_line,
        addressComplement: row.address_complement,
        serviceRadiusKm: row.radius_km,
        lat: parseFloat(row.latitude),
        lng: parseFloat(row.longitude),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return Result.ok<WorkerServiceArea[]>(serviceAreas);
    } catch (error: any) {
      return Result.fail<WorkerServiceArea[]>(`Failed to find service areas: ${error.message}`);
    }
  }

  async deleteByWorkerId(workerId: string): Promise<Result<void>> {
    try {
      const query = `DELETE FROM worker_service_areas WHERE worker_id = $1`;
      await this.pool.query(query, [workerId]);
      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to delete service areas: ${error.message}`);
    }
  }
}
