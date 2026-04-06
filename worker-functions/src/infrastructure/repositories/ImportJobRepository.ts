import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { ImportJob, CreateImportJobDTO, ImportJobStatus, ImportPhase, ImportLogLine } from '../../domain/entities/OperationalEntities';

// =====================================================
// ImportJobRepository
// =====================================================
export class ImportJobRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async create(dto: CreateImportJobDTO): Promise<ImportJob> {
    const result = await this.pool.query(
      `INSERT INTO import_jobs (filename, file_hash, status, created_by)
       VALUES ($1,$2,'pending',$3) RETURNING *`,
      [dto.filename, dto.fileHash, dto.createdBy ?? null]
    );
    return this.mapRow(result.rows[0]);
  }

  async findByFileHash(fileHash: string): Promise<ImportJob | null> {
    const result = await this.pool.query(
      "SELECT * FROM import_jobs WHERE file_hash = $1 AND status = 'done' LIMIT 1",
      [fileHash]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<ImportJob | null> {
    const result = await this.pool.query('SELECT * FROM import_jobs WHERE id = $1', [id]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: ImportJobStatus): Promise<void> {
    const finishedAt = (status === 'done' || status === 'error') ? 'NOW()' : 'finished_at';
    const startedAt = status === 'processing' ? 'NOW()' : 'started_at';

    try {
      await this.pool.query(
        `UPDATE import_jobs SET status = $2, started_at = ${startedAt}, finished_at = ${finishedAt} WHERE id = $1`,
        [id, status]
      );
    } catch (error: any) {
      if (error.message?.includes('idx_import_jobs_file_hash') || error.message?.includes('duplicate key')) {
        console.warn(`[ImportJobRepository] Re-importação detectada para job ${id} - arquivo já foi importado anteriormente. Marcando como 'error'.`);
        await this.pool.query(
          `UPDATE import_jobs SET status = 'error', started_at = ${startedAt}, finished_at = ${finishedAt} WHERE id = $1`,
          [id]
        );
        await this.pool.query(
          `UPDATE import_jobs SET logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
          [id, JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'Arquivo já importado anteriormente (file_hash duplicado). Reimporte cancelado.' })]
        ).catch(() => {});
      } else {
        throw error;
      }
    }
  }

  async updateProgress(id: string, progress: Partial<{
    totalRows: number; processedRows: number; errorRows: number; skippedRows: number;
    workersCreated: number; workersUpdated: number;
    casesCreated: number; casesUpdated: number;
    encuadresCreated: number; encuadresSkipped: number;
    errorDetails: Array<{ row: number; error: string }>;
  }>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    const fieldMap: Record<string, string> = {
      totalRows: 'total_rows', processedRows: 'processed_rows',
      errorRows: 'error_rows', skippedRows: 'skipped_rows',
      workersCreated: 'workers_created', workersUpdated: 'workers_updated',
      casesCreated: 'cases_created', casesUpdated: 'cases_updated',
      encuadresCreated: 'encuadres_created', encuadresSkipped: 'encuadres_skipped',
      errorDetails: 'error_details',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in progress) {
        const val = progress[key as keyof typeof progress];
        sets.push(`${col} = $${idx++}`);
        values.push(key === 'errorDetails' ? JSON.stringify(val) : val);
      }
    }

    if (sets.length === 0) return;
    await this.pool.query(`UPDATE import_jobs SET ${sets.join(', ')} WHERE id = $1`, values);
  }

  async updatePhase(id: string, phase: ImportPhase): Promise<void> {
    await this.pool.query(
      'UPDATE import_jobs SET current_phase = $2 WHERE id = $1',
      [id, phase],
    );
  }

  async appendLog(id: string, line: ImportLogLine): Promise<void> {
    await this.pool.query(
      `UPDATE import_jobs
       SET logs = CASE WHEN jsonb_array_length(COALESCE(logs, '[]'::jsonb)) >= 200
                   THEN (COALESCE(logs, '[]'::jsonb) - 0) || $2::jsonb
                   ELSE COALESCE(logs, '[]'::jsonb) || $2::jsonb
                 END
       WHERE id = $1`,
      [id, JSON.stringify(line)],
    );
  }

  async setQueued(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE import_jobs SET status = 'queued', current_phase = 'queued' WHERE id = $1`,
      [id],
    );
  }

  async cancel(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE import_jobs
       SET status = 'cancelled', current_phase = 'cancelled', cancelled_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async findStaleInProgress(): Promise<ImportJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM import_jobs WHERE status IN ('queued', 'processing')`,
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findActiveByFileHash(fileHash: string): Promise<ImportJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM import_jobs WHERE file_hash = $1 AND status IN ('queued', 'processing') LIMIT 1`,
      [fileHash],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listRecent(limit = 20): Promise<ImportJob[]> {
    const result = await this.pool.query(
      'SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async listPaginated(options: {
    page: number;
    limit: number;
    status?: ImportJobStatus;
  }): Promise<ImportJob[]> {
    const offset = (options.page - 1) * options.limit;
    if (options.status) {
      const result = await this.pool.query(
        `SELECT * FROM import_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [options.status, options.limit, offset],
      );
      return result.rows.map(row => this.mapRow(row));
    }
    const result = await this.pool.query(
      `SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [options.limit, offset],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async count(status?: ImportJobStatus): Promise<number> {
    if (status) {
      const result = await this.pool.query(
        `SELECT COUNT(*)::int AS total FROM import_jobs WHERE status = $1`,
        [status],
      );
      return result.rows[0].total as number;
    }
    const result = await this.pool.query(`SELECT COUNT(*)::int AS total FROM import_jobs`);
    return result.rows[0].total as number;
  }

  private mapRow(row: Record<string, unknown>): ImportJob {
    return {
      id: row.id as string,
      filename: row.filename as string,
      fileHash: row.file_hash as string,
      status: row.status as ImportJobStatus,
      currentPhase: (row.current_phase as ImportPhase) ?? 'upload_received',
      totalRows: row.total_rows as number,
      processedRows: row.processed_rows as number,
      errorRows: row.error_rows as number,
      skippedRows: row.skipped_rows as number,
      workersCreated: row.workers_created as number,
      workersUpdated: row.workers_updated as number,
      casesCreated: row.cases_created as number,
      casesUpdated: row.cases_updated as number,
      encuadresCreated: row.encuadres_created as number,
      encuadresSkipped: row.encuadres_skipped as number,
      errorDetails: row.error_details as ImportJob['errorDetails'],
      logs: (row.logs as ImportLogLine[]) ?? [],
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
      createdBy: row.created_by as string | null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
