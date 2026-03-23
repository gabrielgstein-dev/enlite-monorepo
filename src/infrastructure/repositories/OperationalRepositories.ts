import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  Blacklist, CreateBlacklistDTO,
  Publication, CreatePublicationDTO,
  ImportJob, CreateImportJobDTO, ImportJobStatus,
  WorkerDocExpiry, UpdateDocExpiryDTO,
  FunnelStage, WorkerOccupation,
  WorkerLocation, CreateWorkerLocationDTO,
} from '../../domain/entities/OperationalEntities';

// ─── Tipos locais para as tabelas novas ────────────────────────────────────────

export interface CreatePlacementAuditDTO {
  auditId: string;           // "--1", "--2" — chave natural da planilha
  auditDate?: Date | null;
  workerId?: string | null;
  jobPostingId?: string | null;
  workerRawName?: string | null;
  patientRawName?: string | null;
  coordinatorName?: string | null;
  caseNumberRaw?: number | null;
  rating?: number | null;    // 1–5
  observations?: string | null;
}

export interface CreateCoordinatorScheduleDTO {
  coordinatorName: string;
  coordinatorDni?: string | null;
  fromDate: Date;
  toDate: Date;
  weeklyHours?: number | null;
}

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
    // Use DISTINCT ON to pick only one blacklist row per (phone, reason),
    // avoiding duplicate-key violations on idx_blacklist_worker_reason(worker_id, reason).
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
      `INSERT INTO publications (
         job_posting_id, channel, group_name, recruiter_name,
         published_at, observations, group_geographic_zone, dedup_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (dedup_hash) DO UPDATE SET
         group_geographic_zone = COALESCE(EXCLUDED.group_geographic_zone, publications.group_geographic_zone)
       RETURNING *, (xmax = 0) AS inserted`,
      [
        dto.jobPostingId ?? null,
        dto.channel ?? null,
        dto.groupName ?? null,
        dto.recruiterName ?? null,
        dto.publishedAt ?? null,
        dto.observations ?? null,
        (dto as { groupGeographicZone?: string | null }).groupGeographicZone ?? null,
        dto.dedupHash,
      ]
    );
    const created = result.rows[0]?.inserted ?? false;
    return { publication: this.mapRow(result.rows[0]), created };
  }

  async findByJobPostingId(jobPostingId: string): Promise<Publication[]> {
    const result = await this.pool.query(
      'SELECT * FROM publications WHERE job_posting_id = $1 ORDER BY published_at DESC',
      [jobPostingId]
    );
    return result.rows.map(this.mapRow);
  }

  async countByChannel(filters: { startDate?: string; endDate?: string; country?: string } = {}): Promise<Array<{ channel: string | null; count: number }>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.startDate) { conditions.push(`p.published_at >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`p.published_at <= $${idx++}`); values.push(filters.endDate); }
    if (filters.country)   {
      conditions.push(`jp.country = $${idx++}`);
      values.push(filters.country);
    }

    const where = conditions.length > 0
      ? `JOIN job_postings jp ON p.job_posting_id = jp.id WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await this.pool.query(
      `SELECT p.channel, COUNT(*)::int AS count FROM publications p ${where} GROUP BY p.channel ORDER BY count DESC`,
      values
    );
    return result.rows.map(r => ({ channel: r.channel as string | null, count: r.count as number }));
  }

  async countByChannelForJobPosting(jobPostingId: string, filters: { startDate?: string; endDate?: string } = {}): Promise<Array<{ channel: string | null; count: number }>> {
    const conditions: string[] = ['job_posting_id = $1'];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`published_at >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`published_at <= $${idx++}`); values.push(filters.endDate); }

    const result = await this.pool.query(
      `SELECT channel, COUNT(*)::int AS count FROM publications WHERE ${conditions.join(' AND ')} GROUP BY channel ORDER BY count DESC`,
      values
    );
    return result.rows.map(r => ({ channel: r.channel as string | null, count: r.count as number }));
  }

  async findByJobPosting(jobPostingId: string, filters: { startDate?: string; endDate?: string; orderBy?: string } = {}): Promise<Publication[]> {
    const conditions: string[] = ['job_posting_id = $1'];
    const values: unknown[] = [jobPostingId];
    let idx = 2;

    if (filters.startDate) { conditions.push(`published_at >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`published_at <= $${idx++}`); values.push(filters.endDate); }

    const orderBy = /^[a-z_\s]+$/i.test(filters.orderBy ?? '') ? filters.orderBy : 'published_at DESC';
    const result = await this.pool.query(
      `SELECT * FROM publications WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
      values
    );
    return result.rows.map(this.mapRow);
  }

  async findLastPublicationPerCase(country: string = 'AR'): Promise<Array<{ caseNumber: number; timeAgo: string; channel: string | null }>> {
    const result = await this.pool.query(
      `SELECT jp.case_number,
              p.channel,
              CASE
                WHEN p.published_at IS NULL THEN 'Sin fecha'
                WHEN NOW() - p.published_at < INTERVAL '1 day'   THEN 'Hoy'
                WHEN NOW() - p.published_at < INTERVAL '7 days'  THEN (EXTRACT(DAY FROM NOW() - p.published_at)::int)::text || 'd atrás'
                WHEN NOW() - p.published_at < INTERVAL '30 days' THEN (EXTRACT(WEEK FROM NOW() - p.published_at)::int)::text || 'sem atrás'
                ELSE (EXTRACT(MONTH FROM NOW() - p.published_at)::int)::text || 'mes atrás'
              END AS time_ago
       FROM job_postings jp
       LEFT JOIN LATERAL (
         SELECT channel, published_at
         FROM publications
         WHERE job_posting_id = jp.id
         ORDER BY published_at DESC NULLS LAST
         LIMIT 1
       ) p ON TRUE
       WHERE jp.country = $1`,
      [country]
    );
    return result.rows.map(r => ({
      caseNumber: r.case_number as number,
      timeAgo:    r.time_ago as string,
      channel:    r.channel as string | null,
    }));
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
    status?: string | null;
    priority?: string | null;
    isCovered?: boolean;
    coordinatorName?: string | null;
    dailyObs?: string | null;
    inferredZone?: string | null;
    country?: string;
  }): Promise<{ id: string; created: boolean }> {
    try {
      const result = await this.pool.query(
        `INSERT INTO job_postings (
           case_number, status, priority,
           is_covered, coordinator_name,
           daily_obs, inferred_zone,
           country, title, description
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (case_number) DO UPDATE SET
           status           = COALESCE(EXCLUDED.status, job_postings.status),
           priority         = COALESCE(EXCLUDED.priority, job_postings.priority),
           is_covered       = EXCLUDED.is_covered,
           coordinator_name = COALESCE(EXCLUDED.coordinator_name, job_postings.coordinator_name),
           daily_obs        = EXCLUDED.daily_obs,
           inferred_zone    = COALESCE(EXCLUDED.inferred_zone, job_postings.inferred_zone)
         RETURNING id, (xmax = 0) AS inserted`,
        [
          data.caseNumber,
          data.status ?? null,
          data.priority ?? null,
          data.isCovered ?? false,
          data.coordinatorName ?? null,
          data.dailyObs ?? null,
          data.inferredZone ?? null,
          data.country ?? 'AR',
          `Caso ${data.caseNumber}`,
          `Caso operacional importado. Case #${data.caseNumber}`,
        ]
      );

      const jobPostingId = result.rows[0].id as string;
      const created = result.rows[0].inserted as boolean;
      return { id: jobPostingId, created };
    } catch (err) {
      console.error(`[JobPostingRepo.upsertByCaseNumber] ERROR | caseNumber: ${data.caseNumber} | error: ${(err as Error).message}`);
      throw err;
    }
  }

  async findByCaseNumber(caseNumber: number): Promise<{ id: string } | null> {
    const result = await this.pool.query(
      'SELECT id FROM job_postings WHERE case_number = $1',
      [caseNumber]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Incrementa job_postings com dados do ClickUp.
   * Garante que a vacante existe (via UPSERT por case_number) e depois
   * preenche os campos específicos do ClickUp sem sobrescrever dados de
   * outras fontes (COALESCE mantém valores existentes quando o novo é NULL).
   */
  async upsertFromClickUp(data: {
    caseNumber: number;
    clickupTaskId?: string | null;
    status?: string | null;
    priority?: string | null;
    title?: string | null;
    description?: string | null;
    workerProfileSought?: string | null;
    scheduleDaysHours?: string | null;
    sourceCreatedAt?: Date | null;
    sourceUpdatedAt?: Date | null;
    dueDate?: Date | null;
    searchStartDate?: Date | null;
    lastComment?: string | null;
    commentCount?: number | null;
    assignee?: string | null;
    // Relations
    patientId?: string | null;
    weeklyHours?: number | null;
    providersNeeded?: string | null;
    activeProviders?: number | null;
    authorizedPeriod?: Date | null;
    marketingChannel?: string | null;
    // Service address (Domicilio 1 Principal Paciente = local do atendimento)
    serviceAddressFormatted?: string | null;
    serviceAddressRaw?: string | null;
    country?: string;
  }): Promise<{ id: string; created: boolean }> {
    const country = data.country ?? 'AR';
    const title = data.title ?? `Caso ${data.caseNumber}`;

    const result = await this.pool.query<{ id: string; xmax: string }>(
      `INSERT INTO job_postings (
         case_number, country, title, description,
         clickup_task_id, status, priority,
         worker_profile_sought, schedule_days_hours,
         source_created_at, source_updated_at, due_date,
         search_start_date, last_comment, comment_count, assignee,
         patient_id, weekly_hours, providers_needed, active_providers,
         authorized_period, marketing_channel,
         service_address_formatted, service_address_raw
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24
       )
       ON CONFLICT (case_number) DO UPDATE SET
         clickup_task_id           = EXCLUDED.clickup_task_id,
         status                    = EXCLUDED.status,
         priority                  = EXCLUDED.priority,
         title                     = EXCLUDED.title,
         description               = EXCLUDED.description,
         worker_profile_sought     = EXCLUDED.worker_profile_sought,
         schedule_days_hours       = EXCLUDED.schedule_days_hours,
         source_created_at         = EXCLUDED.source_created_at,
         source_updated_at         = EXCLUDED.source_updated_at,
         due_date                  = EXCLUDED.due_date,
         search_start_date         = EXCLUDED.search_start_date,
         last_comment              = EXCLUDED.last_comment,
         comment_count             = EXCLUDED.comment_count,
         assignee                  = EXCLUDED.assignee,
         patient_id                = EXCLUDED.patient_id,
         weekly_hours              = EXCLUDED.weekly_hours,
         providers_needed          = EXCLUDED.providers_needed,
         active_providers          = EXCLUDED.active_providers,
         authorized_period         = EXCLUDED.authorized_period,
         marketing_channel         = EXCLUDED.marketing_channel,
         service_address_formatted = EXCLUDED.service_address_formatted,
         service_address_raw       = EXCLUDED.service_address_raw,
         updated_at                = NOW()
       RETURNING id, xmax::text`,
      [
        data.caseNumber,                          // $1
        country,                                  // $2
        title,                                    // $3
        data.description ?? `Caso operacional importado do ClickUp. Nº ${data.caseNumber}`, // $4
        data.clickupTaskId          ?? null,      // $5
        data.status                 ?? null,      // $6
        data.priority               ?? null,      // $7
        data.workerProfileSought    ?? null,      // $8
        data.scheduleDaysHours      ?? null,      // $9
        data.sourceCreatedAt        ?? null,      // $10
        data.sourceUpdatedAt        ?? null,      // $11
        data.dueDate                ?? null,      // $12
        data.searchStartDate        ?? null,      // $13
        data.lastComment            ?? null,      // $14
        data.commentCount           ?? null,      // $15
        data.assignee               ?? null,      // $16
        data.patientId              ?? null,      // $17
        data.weeklyHours            ?? null,      // $18
        data.providersNeeded        ?? null,      // $19
        data.activeProviders        ?? null,      // $20
        data.authorizedPeriod       ?? null,      // $21
        data.marketingChannel       ?? null,      // $22
        data.serviceAddressFormatted ?? null,     // $23
        data.serviceAddressRaw       ?? null,     // $24
      ]
    );

    const row = result.rows[0];
    return { id: row.id, created: row.xmax === '0' };
  }

  /**
   * Salva um comentário do ClickUp no histórico SE for diferente do último
   * já registrado OU se o comment_count aumentou (indica novo comentário).
   *
   * Retorna true se um novo registro foi inserido.
   */
  async saveCommentIfNew(params: {
    jobPostingId: string;
    commentText: string;
    commentCount: number | null;
  }): Promise<boolean> {
    if (!params.commentText.trim()) return false;

    // Busca o último comentário salvo para esta vaga
    const last = await this.pool.query<{ comment_text: string; clickup_comment_count: number | null }>(
      `SELECT comment_text, clickup_comment_count
       FROM job_posting_comments
       WHERE job_posting_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [params.jobPostingId]
    );

    const lastRow = last.rows[0];

    const textChanged = !lastRow || lastRow.comment_text !== params.commentText;
    const countGrew   = params.commentCount !== null
                        && lastRow !== undefined
                        && lastRow.clickup_comment_count !== null
                        && params.commentCount > (lastRow.clickup_comment_count ?? 0);

    if (!textChanged && !countGrew) return false;

    await this.pool.query(
      `INSERT INTO job_posting_comments (job_posting_id, source, comment_text, clickup_comment_count)
       VALUES ($1, 'clickup', $2, $3)`,
      [params.jobPostingId, params.commentText, params.commentCount ?? null]
    );

    return true;
  }
}


// =====================================================
// PlacementAuditRepository
// Gerencia auditoria pós-alocação (aba _AuditoriaOnboarding)
// Chave de dedup: audit_id (--1, --2, ...)
// =====================================================
export class PlacementAuditRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreatePlacementAuditDTO): Promise<{ created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO worker_placement_audits (
         audit_id, audit_date,
         worker_id, job_posting_id,
         worker_raw_name, patient_raw_name, coordinator_name, case_number_raw,
         rating, observations
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (audit_id) DO UPDATE SET
         audit_date       = EXCLUDED.audit_date,
         worker_id        = COALESCE(EXCLUDED.worker_id, worker_placement_audits.worker_id),
         job_posting_id   = COALESCE(EXCLUDED.job_posting_id, worker_placement_audits.job_posting_id),
         worker_raw_name  = COALESCE(EXCLUDED.worker_raw_name, worker_placement_audits.worker_raw_name),
         patient_raw_name = COALESCE(EXCLUDED.patient_raw_name, worker_placement_audits.patient_raw_name),
         coordinator_name = COALESCE(EXCLUDED.coordinator_name, worker_placement_audits.coordinator_name),
         case_number_raw  = COALESCE(EXCLUDED.case_number_raw, worker_placement_audits.case_number_raw),
         rating           = EXCLUDED.rating,
         observations     = EXCLUDED.observations,
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        dto.auditId,
        dto.auditDate ?? null,
        dto.workerId ?? null,
        dto.jobPostingId ?? null,
        dto.workerRawName ?? null,
        dto.patientRawName ?? null,
        dto.coordinatorName ?? null,
        dto.caseNumberRaw ?? null,
        dto.rating ?? null,
        dto.observations ?? null,
      ]
    );
    return { created: result.rows[0]?.inserted ?? false };
  }

  /** Calcula rating médio de um worker (para score de match) */
  async avgRatingByWorker(workerId: string): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 2) AS avg
       FROM worker_placement_audits
       WHERE worker_id = $1 AND rating IS NOT NULL`,
      [workerId]
    );
    return result.rows[0]?.avg ?? null;
  }

  async linkWorkersByPhone(): Promise<number> {
    const result = await this.pool.query(`
      UPDATE worker_placement_audits a
      SET worker_id = w.id
      FROM workers w
      WHERE a.worker_id IS NULL
        AND a.worker_raw_name IS NOT NULL
        AND w.phone IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM encuadres e
          WHERE e.worker_id = w.id
            AND e.worker_raw_name ILIKE a.worker_raw_name
        )
    `);
    return result.rowCount ?? 0;
  }

  async linkJobPostingsByCaseNumber(): Promise<number> {
    const result = await this.pool.query(`
      UPDATE worker_placement_audits a
      SET job_posting_id = jp.id
      FROM job_postings jp
      WHERE a.job_posting_id IS NULL
        AND a.case_number_raw IS NOT NULL
        AND jp.case_number = a.case_number_raw
    `);
    return result.rowCount ?? 0;
  }
}


// =====================================================
// CoordinatorScheduleRepository
// Gerencia horas semanais por coordenadora (aba _HorasSemanales)
// Chave de dedup: (coordinator_name, from_date, to_date)
// =====================================================
export class CoordinatorScheduleRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreateCoordinatorScheduleDTO): Promise<{ created: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO coordinator_weekly_schedules (
         coordinator_name, coordinator_dni, from_date, to_date, weekly_hours
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (coordinator_name, from_date, to_date) DO UPDATE SET
         coordinator_dni = COALESCE(EXCLUDED.coordinator_dni, coordinator_weekly_schedules.coordinator_dni),
         weekly_hours    = EXCLUDED.weekly_hours,
         updated_at      = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        dto.coordinatorName,
        dto.coordinatorDni ?? null,
        dto.fromDate,
        dto.toDate,
        dto.weeklyHours ?? null,
      ]
    );
    return { created: result.rows[0]?.inserted ?? false };
  }

  /** Horas disponíveis de uma coordenadora em uma semana específica */
  async findByCoordinatorAndDate(coordinatorName: string, date: Date): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT weekly_hours FROM coordinator_weekly_schedules
       WHERE coordinator_name ILIKE $1
         AND from_date <= $2
         AND to_date   >= $2
       ORDER BY from_date DESC LIMIT 1`,
      [coordinatorName, date.toISOString().split('T')[0]]
    );
    return result.rows[0]?.weekly_hours ?? null;
  }
}


// =====================================================
// WorkerFunnelRepository
// Atualiza occupation e overall_status (campos fixos do worker)
// =====================================================
export class WorkerFunnelRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async updateFunnelStage(workerId: string, stage: FunnelStage): Promise<void> {
    await this.pool.query(
      'UPDATE workers SET overall_status = $2 WHERE id = $1',
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
    const conditions = ['overall_status = $1'];
    const values: unknown[] = [stage];
    let idx = 2;

    if (options.occupation) {
      conditions.push(`occupation = $${idx++}`);
      values.push(options.occupation);
    }

    values.push(options.limit ?? 50);
    values.push(options.offset ?? 0);

    const result = await this.pool.query(
      `SELECT id, phone, email, first_name, last_name, occupation, overall_status, created_at
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
      funnelStage: r.overall_status,
      createdAt: new Date(r.created_at),
    }));
  }

  async countByFunnelStage(): Promise<Record<FunnelStage, number>> {
    const result = await this.pool.query(
      `SELECT overall_status, COUNT(*) as count
       FROM workers
       GROUP BY overall_status`
    );

    const counts: Record<string, number> = {
      PRE_TALENTUM: 0, TALENTUM: 0, QUALIFIED: 0, BLACKLIST: 0,
    };

    for (const row of result.rows) {
      counts[row.overall_status] = parseInt(row.count);
    }

    return counts as Record<FunnelStage, number>;
  }

  /** Conta workers em múltiplos overall_statuss, com filtros opcionais de data e country */
  async countByFunnelStages(
    stages: string[],
    filters: { startDate?: string; endDate?: string; country?: string } = {}
  ): Promise<number> {
    if (stages.length === 0) return 0;

    const placeholders = stages.map((_, i) => `$${i + 1}`).join(', ');
    const values: unknown[] = [...stages];
    let idx = stages.length + 1;

    const conditions: string[] = [`overall_status IN (${placeholders})`];
    if (filters.startDate) { conditions.push(`created_at >= $${idx++}`); values.push(filters.startDate); }
    if (filters.endDate)   { conditions.push(`created_at <= $${idx++}`); values.push(filters.endDate); }
    if (filters.country)   { conditions.push(`country = $${idx++}`);     values.push(filters.country); }

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM workers WHERE ${conditions.join(' AND ')}`,
      values
    );
    return (result.rows[0]?.count as number) ?? 0;
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

  /**
   * Verifica se a coluna 'source' existe (migration 019).
   * Cache o resultado para evitar múltiplas queries.
   */
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

  /**
   * Cria uma aplicação worker ↔ job_posting.
   * ON CONFLICT DO NOTHING — idempotente.
   * Compatível com migration 019 (source) ou sem ela.
   */
  async upsert(
    workerId: string,
    jobPostingId: string,
    source = 'talent_search',
    applicationStatus = 'applied',
  ): Promise<{ created: boolean }> {
    const hasSource = await this.hasSourceColumn();

    try {
      const result = hasSource
        ? await this.pool.query(
            `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_status, source)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (worker_id, job_posting_id) DO NOTHING
             RETURNING id`,
            [workerId, jobPostingId, applicationStatus, source],
          )
        : await this.pool.query(
            `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_status)
             VALUES ($1, $2, $3)
             ON CONFLICT (worker_id, job_posting_id) DO NOTHING
             RETURNING id`,
            [workerId, jobPostingId, applicationStatus],
          );

      return { created: (result.rowCount ?? 0) > 0 };
    } catch (err) {
      console.error(`[WorkerApplicationRepo.upsert] ERROR | ${(err as Error).message} | workerId: ${workerId} | jobPostingId: ${jobPostingId}`);
      throw err;
    }
  }

  async findByWorkerId(
    workerId: string,
  ): Promise<{ jobPostingId: string; applicationStatus: string; source: string | null }[]> {
    const result = await this.pool.query(
      `SELECT job_posting_id, application_status, source
       FROM worker_job_applications
       WHERE worker_id = $1
       ORDER BY created_at DESC`,
      [workerId],
    );
    return result.rows.map(r => ({
      jobPostingId: r.job_posting_id,
      applicationStatus: r.application_status,
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

  /** Conta candidatos por caso (source = 'candidatos' ou overall_status = PRE_TALENTUM) */
  async countCandidatesByCaseNumber(country: string = 'AR'): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT jp.case_number, COUNT(DISTINCT wja.worker_id)::int AS count
       FROM worker_job_applications wja
       JOIN job_postings jp ON wja.job_posting_id = jp.id
       JOIN workers w ON wja.worker_id = w.id
       WHERE jp.country = $1
         AND w.overall_status = 'PRE_TALENTUM'
       GROUP BY jp.case_number`,
      [country]
    );
    const map: Record<string, number> = {};
    for (const r of result.rows) {
      map[String(r.case_number)] = r.count as number;
    }
    return map;
  }

  /** Conta postulados por caso (source = 'talent_search' ou overall_status QUALIFIED/TALENTUM) */
  async countPostuladosByCaseNumber(country: string = 'AR'): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT jp.case_number, COUNT(DISTINCT wja.worker_id)::int AS count
       FROM worker_job_applications wja
       JOIN job_postings jp ON wja.job_posting_id = jp.id
       JOIN workers w ON wja.worker_id = w.id
       WHERE jp.country = $1
         AND w.overall_status IN ('QUALIFIED', 'TALENTUM')
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

  /**
   * Cria ou atualiza a localização de um worker.
   * ON CONFLICT DO UPDATE — upsert baseado no worker_id.
   */
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
