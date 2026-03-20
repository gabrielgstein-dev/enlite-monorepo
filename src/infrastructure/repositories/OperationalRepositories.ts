import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  Blacklist, CreateBlacklistDTO,
  Publication, CreatePublicationDTO,
  ImportJob, CreateImportJobDTO, ImportJobStatus,
  WorkerDocExpiry, UpdateDocExpiryDTO,
  FunnelStage, WorkerOccupation,
} from '../../domain/entities/OperationalEntities';

// =====================================================
// BlacklistRepository
// =====================================================
export class BlacklistRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreateBlacklistDTO): Promise<{ entry: Blacklist; created: boolean }> {
    if (dto.workerId) {
      const result = await this.pool.query(
        `INSERT INTO blacklist (worker_id, worker_raw_name, worker_raw_phone, reason, detail, registered_by, can_take_eventual)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (worker_id, reason) DO UPDATE
           SET detail = EXCLUDED.detail,
               registered_by = EXCLUDED.registered_by,
               can_take_eventual = EXCLUDED.can_take_eventual
         RETURNING *, (xmax = 0) AS inserted`,
        [dto.workerId, dto.workerRawName ?? null, dto.workerRawPhone ?? null,
         dto.reason, dto.detail ?? null, dto.registeredBy ?? null, dto.canTakeEventual ?? false]
      );
      return { entry: this.mapRow(result.rows[0]), created: result.rows[0].inserted };
    }

    const result = await this.pool.query(
      `INSERT INTO blacklist (worker_raw_name, worker_raw_phone, reason, detail, registered_by, can_take_eventual)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [dto.workerRawName ?? null, dto.workerRawPhone ?? null,
       dto.reason, dto.detail ?? null, dto.registeredBy ?? null, dto.canTakeEventual ?? false]
    );
    return { entry: this.mapRow(result.rows[0]), created: true };
  }

  async findByWorkerId(workerId: string): Promise<Blacklist[]> {
    const result = await this.pool.query(
      'SELECT * FROM blacklist WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId]
    );
    return result.rows.map(this.mapRow);
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
      UPDATE blacklist b
      SET worker_id = w.id
      FROM workers w
      WHERE b.worker_id IS NULL
        AND b.worker_raw_phone IS NOT NULL
        AND w.phone = b.worker_raw_phone
    `);
    return result.rowCount ?? 0;
  }

  private mapRow(row: Record<string, unknown>): Blacklist {
    return {
      id: row.id as string,
      workerId: row.worker_id as string | null,
      workerRawName: row.worker_raw_name as string | null,
      workerRawPhone: row.worker_raw_phone as string | null,
      reason: row.reason as string,
      detail: row.detail as string | null,
      registeredBy: row.registered_by as string | null,
      canTakeEventual: row.can_take_eventual as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}


// =====================================================
// PublicationRepository
// =====================================================
export class PublicationRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreatePublicationDTO): Promise<{ publication: Publication; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO publications (job_posting_id, channel, group_name, recruiter_name, published_at, observations, dedup_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (dedup_hash) DO NOTHING
       RETURNING *`,
      [dto.jobPostingId ?? null, dto.channel ?? null, dto.groupName ?? null,
       dto.recruiterName ?? null, dto.publishedAt ?? null, dto.observations ?? null, dto.dedupHash]
    );

    if (result.rows.length === 0) {
      const existing = await this.pool.query(
        'SELECT * FROM publications WHERE dedup_hash = $1', [dto.dedupHash]
      );
      return { publication: this.mapRow(existing.rows[0]), created: false };
    }
    return { publication: this.mapRow(result.rows[0]), created: true };
  }

  async findByJobPostingId(jobPostingId: string): Promise<Publication[]> {
    const result = await this.pool.query(
      'SELECT * FROM publications WHERE job_posting_id = $1 ORDER BY published_at DESC',
      [jobPostingId]
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): Publication {
    return {
      id: row.id as string,
      jobPostingId: row.job_posting_id as string | null,
      channel: row.channel as string | null,
      groupName: row.group_name as string | null,
      recruiterName: row.recruiter_name as string | null,
      publishedAt: row.published_at ? new Date(row.published_at as string) : null,
      observations: row.observations as string | null,
      dedupHash: row.dedup_hash as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}


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
    await this.pool.query(
      `UPDATE import_jobs SET status = $2, started_at = ${startedAt}, finished_at = ${finishedAt} WHERE id = $1`,
      [id, status]
    );
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

  async listRecent(limit = 20): Promise<ImportJob[]> {
    const result = await this.pool.query(
      'SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): ImportJob {
    return {
      id: row.id as string,
      filename: row.filename as string,
      fileHash: row.file_hash as string,
      status: row.status as ImportJobStatus,
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
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
      createdBy: row.created_by as string | null,
      createdAt: new Date(row.created_at as string),
    };
  }
}


// =====================================================
// JobPostingARRepository
// =====================================================
export class JobPostingARRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsertByCaseNumber(data: {
    caseNumber: number;
    patientName?: string | null;
    status?: string;
    dependency?: 'GRAVE' | 'MUY_GRAVE' | null;
    priority?: 'URGENTE' | 'NORMAL' | null;
    isCovered?: boolean;
    coordinatorName?: string | null;
    country?: string;
  }): Promise<{ id: string; created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO job_postings (
         case_number, patient_name, status, dependency, priority,
         is_covered, coordinator_name, country, title, description
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (case_number) DO UPDATE SET
         patient_name     = COALESCE(EXCLUDED.patient_name, job_postings.patient_name),
         status           = EXCLUDED.status,
         dependency       = COALESCE(EXCLUDED.dependency, job_postings.dependency),
         priority         = COALESCE(EXCLUDED.priority, job_postings.priority),
         is_covered       = EXCLUDED.is_covered,
         coordinator_name = COALESCE(EXCLUDED.coordinator_name, job_postings.coordinator_name)
       RETURNING id, (xmax = 0) AS inserted`,
      [
        data.caseNumber,
        data.patientName ?? null,
        data.status ?? 'active',
        data.dependency ?? null,
        data.priority ?? 'NORMAL',
        data.isCovered ?? false,
        data.coordinatorName ?? null,
        data.country ?? 'AR',
        data.patientName
          ? `Caso ${data.caseNumber} - ${data.patientName}`
          : `Caso ${data.caseNumber}`,
        `Caso operacional importado. Case #${data.caseNumber}`,
      ]
    );

    return {
      id: result.rows[0].id as string,
      created: result.rows[0].inserted as boolean,
    };
  }

  async findByCaseNumber(caseNumber: number): Promise<{ id: string } | null> {
    const result = await this.pool.query(
      'SELECT id FROM job_postings WHERE case_number = $1',
      [caseNumber]
    );
    return result.rows[0] ?? null;
  }
}


// =====================================================
// WorkerFunnelRepository
// Atualiza occupation e funnel_stage (campos fixos do worker)
// =====================================================
export class WorkerFunnelRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async updateFunnelStage(workerId: string, stage: FunnelStage): Promise<void> {
    await this.pool.query(
      'UPDATE workers SET funnel_stage = $2 WHERE id = $1',
      [workerId, stage]
    );
  }

  async updateOccupation(workerId: string, occupation: WorkerOccupation): Promise<void> {
    await this.pool.query(
      'UPDATE workers SET occupation = $2 WHERE id = $1',
      [workerId, occupation]
    );
  }

  async listByFunnelStage(
    stage: FunnelStage,
    options: { limit?: number; offset?: number; occupation?: WorkerOccupation } = {}
  ): Promise<Array<{
    id: string; phone: string | null; email: string; firstName: string | null;
    lastName: string | null; occupation: string | null; funnelStage: string;
    createdAt: Date;
  }>> {
    const conditions = ['funnel_stage = $1'];
    const values: unknown[] = [stage];
    let idx = 2;

    if (options.occupation) {
      conditions.push(`occupation = $${idx++}`);
      values.push(options.occupation);
    }

    values.push(options.limit ?? 50);
    values.push(options.offset ?? 0);

    const result = await this.pool.query(
      `SELECT id, phone, email, first_name, last_name, occupation, funnel_stage, created_at
       FROM workers
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    return result.rows.map(r => ({
      id: r.id,
      phone: r.phone,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      occupation: r.occupation,
      funnelStage: r.funnel_stage,
      createdAt: new Date(r.created_at),
    }));
  }

  async countByFunnelStage(): Promise<Record<FunnelStage, number>> {
    const result = await this.pool.query(
      `SELECT funnel_stage, COUNT(*) as count
       FROM workers
       GROUP BY funnel_stage`
    );

    const counts: Record<string, number> = {
      PRE_TALENTUM: 0, TALENTUM: 0, QUALIFIED: 0, BLACKLIST: 0,
    };

    for (const row of result.rows) {
      counts[row.funnel_stage] = parseInt(row.count);
    }

    return counts as Record<FunnelStage, number>;
  }
}


// =====================================================
// DocExpiryRepository
// Gerencia vencimentos de documentos (migration 015)
// =====================================================
export class DocExpiryRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async update(dto: UpdateDocExpiryDTO): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [dto.workerId];
    let idx = 2;

    if (dto.criminalRecordExpiry !== undefined) {
      sets.push(`criminal_record_expiry = $${idx++}`);
      values.push(dto.criminalRecordExpiry);
    }
    if (dto.insuranceExpiry !== undefined) {
      sets.push(`insurance_expiry = $${idx++}`);
      values.push(dto.insuranceExpiry);
    }
    if (dto.professionalRegExpiry !== undefined) {
      sets.push(`professional_reg_expiry = $${idx++}`);
      values.push(dto.professionalRegExpiry);
    }

    if (sets.length === 0) return;

    // Garante que o registro existe antes de update
    await this.pool.query(
      `INSERT INTO worker_documents (worker_id, documents_status)
       VALUES ($1, 'pending')
       ON CONFLICT (worker_id) DO NOTHING`,
      [dto.workerId]
    );

    await this.pool.query(
      `UPDATE worker_documents SET ${sets.join(', ')}, updated_at = NOW() WHERE worker_id = $1`,
      values
    );
  }

  async findByWorkerId(workerId: string): Promise<WorkerDocExpiry | null> {
    const result = await this.pool.query(
      `SELECT worker_id, criminal_record_expiry, insurance_expiry, professional_reg_expiry
       FROM worker_documents WHERE worker_id = $1`,
      [workerId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  // Busca todos os workers com documentos vencidos ou vencendo em N dias
  async findExpiringSoon(daysAhead = 30): Promise<WorkerDocExpiry[]> {
    const result = await this.pool.query(
      `SELECT * FROM workers_docs_expiry_alert
       WHERE criminal_expiring_soon = true
          OR insurance_expiring_soon = true
          OR profreg_expiring_soon = true
          OR criminal_expired = true
          OR insurance_expired = true
          OR profreg_expired = true`,
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): WorkerDocExpiry {
    return {
      workerId: row.worker_id as string,
      criminalRecordExpiry: row.criminal_record_expiry ? new Date(row.criminal_record_expiry as string) : null,
      insuranceExpiry: row.insurance_expiry ? new Date(row.insurance_expiry as string) : null,
      professionalRegExpiry: row.professional_reg_expiry ? new Date(row.professional_reg_expiry as string) : null,
      criminalExpiringSoon: row.criminal_expiring_soon as boolean | undefined,
      insuranceExpiringSoon: row.insurance_expiring_soon as boolean | undefined,
      profregExpiringSoon: row.profreg_expiring_soon as boolean | undefined,
      criminalExpired: row.criminal_expired as boolean | undefined,
      insuranceExpired: row.insurance_expired as boolean | undefined,
      profregExpired: row.profreg_expired as boolean | undefined,
    };
  }
}
