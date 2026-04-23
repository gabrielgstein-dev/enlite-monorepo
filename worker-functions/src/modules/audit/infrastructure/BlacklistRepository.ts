import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { KMSEncryptionService } from '@shared/security/KMSEncryptionService';
import { Blacklist, CreateBlacklistDTO } from '../domain/Blacklist';

// =====================================================
// BlacklistRepository
// =====================================================
export class BlacklistRepository {
  private pool: Pool;
  private encryptionService: KMSEncryptionService;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.encryptionService = new KMSEncryptionService();
  }

  async upsert(dto: CreateBlacklistDTO): Promise<{ entry: Blacklist; created: boolean }> {
    const reasonEncrypted = await this.encryptionService.encrypt(dto.reason);
    const detailEncrypted = await this.encryptionService.encrypt(dto.detail ?? null);

    if (dto.workerId) {
      const result = await this.pool.query(
        `INSERT INTO blacklist (worker_id, worker_raw_name, worker_raw_phone,
           reason, reason_encrypted, detail, detail_encrypted,
           registered_by, can_take_eventual)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (worker_id, reason) DO UPDATE
           SET detail = EXCLUDED.detail,
               detail_encrypted = EXCLUDED.detail_encrypted,
               registered_by = EXCLUDED.registered_by,
               can_take_eventual = EXCLUDED.can_take_eventual
         RETURNING *, (xmax = 0) AS inserted`,
        [dto.workerId, dto.workerRawName ?? null, dto.workerRawPhone ?? null,
         dto.reason, reasonEncrypted, dto.detail ?? null, detailEncrypted,
         dto.registeredBy ?? null, dto.canTakeEventual ?? false]
      );
      return { entry: await this.mapRow(result.rows[0]), created: result.rows[0].inserted };
    }

    const result = await this.pool.query(
      `INSERT INTO blacklist (worker_raw_name, worker_raw_phone,
         reason, reason_encrypted, detail, detail_encrypted,
         registered_by, can_take_eventual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (worker_raw_phone, reason) WHERE worker_id IS NULL AND worker_raw_phone IS NOT NULL
         DO UPDATE SET
           detail = EXCLUDED.detail,
           detail_encrypted = EXCLUDED.detail_encrypted,
           registered_by = EXCLUDED.registered_by,
           can_take_eventual = EXCLUDED.can_take_eventual
       RETURNING *, (xmax = 0) AS inserted`,
      [dto.workerRawName ?? null, dto.workerRawPhone ?? null,
       dto.reason, reasonEncrypted, dto.detail ?? null, detailEncrypted,
       dto.registeredBy ?? null, dto.canTakeEventual ?? false]
    );
    return { entry: await this.mapRow(result.rows[0]), created: result.rows[0].inserted };
  }

  async findByWorkerId(workerId: string): Promise<Blacklist[]> {
    const result = await this.pool.query(
      'SELECT * FROM blacklist WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId]
    );
    return Promise.all(result.rows.map(row => this.mapRow(row)));
  }

  async isBlacklisted(workerId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM blacklist WHERE worker_id = $1 LIMIT 1',
      [workerId]
    );
    return result.rows.length > 0;
  }

  async linkWorkersByPhone(): Promise<number> {
    const result = await this.pool.query(`
      WITH candidates AS (
        SELECT DISTINCT ON (w.id, b.reason)
          b.id,
          w.id AS new_worker_id
        FROM blacklist b
        JOIN workers w ON w.phone = b.worker_raw_phone
        WHERE b.worker_id IS NULL
          AND b.worker_raw_phone IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM blacklist ex
            WHERE ex.worker_id = w.id AND ex.reason = b.reason
          )
        ORDER BY w.id, b.reason, b.id
      )
      UPDATE blacklist b
      SET worker_id = c.new_worker_id
      FROM candidates c
      WHERE b.id = c.id
    `);
    return result.rowCount ?? 0;
  }

  private async mapRow(row: Record<string, unknown>): Promise<Blacklist> {
    const reason = row.reason_encrypted
      ? await this.encryptionService.decrypt(row.reason_encrypted as string)
      : row.reason as string;
    const detail = row.detail_encrypted
      ? await this.encryptionService.decrypt(row.detail_encrypted as string)
      : row.detail as string | null;

    return {
      id: row.id as string,
      workerId: row.worker_id as string | null,
      workerRawName: row.worker_raw_name as string | null,
      workerRawPhone: row.worker_raw_phone as string | null,
      reason,
      detail,
      registeredBy: row.registered_by as string | null,
      canTakeEventual: row.can_take_eventual as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}
