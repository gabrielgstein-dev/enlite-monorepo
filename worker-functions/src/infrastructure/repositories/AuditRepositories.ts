import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { WorkerDocExpiry, UpdateDocExpiryDTO } from '../../domain/entities/OperationalEntities';

// ─── Helper: resolve coordinator_name → coordinator_id (findOrCreate) ──────────

async function resolveCoordinatorId(
  pool: Pool,
  coordinatorName: string | null | undefined
): Promise<string | null> {
  if (!coordinatorName) return null;
  const result = await pool.query(
    `INSERT INTO coordinators (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [coordinatorName.trim()]
  );
  return result.rows[0].id;
}

export interface CreatePlacementAuditDTO {
  auditId: string;
  auditDate?: Date | null;
  workerId?: string | null;
  jobPostingId?: string | null;
  workerRawName?: string | null;
  patientRawName?: string | null;
  coordinatorName?: string | null;
  caseNumberRaw?: number | null;
  rating?: number | null;
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
// PlacementAuditRepository
// Gerencia auditoria pós-alocação (aba _AuditoriaOnboarding)
// Chave de dedup: audit_id (--1, --2, ...)
// =====================================================
export class PlacementAuditRepository {
  private pool: Pool;
  constructor() { this.pool = DatabaseConnection.getInstance().getPool(); }

  async upsert(dto: CreatePlacementAuditDTO): Promise<{ created: boolean }> {
    const coordinatorId = await resolveCoordinatorId(this.pool, dto.coordinatorName);
    const result = await this.pool.query(
      `INSERT INTO worker_placement_audits (
         audit_id, audit_date,
         worker_id, job_posting_id,
         worker_raw_name, patient_raw_name, coordinator_name, coordinator_id, case_number_raw,
         rating, observations
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (audit_id) DO UPDATE SET
         audit_date       = EXCLUDED.audit_date,
         worker_id        = COALESCE(EXCLUDED.worker_id, worker_placement_audits.worker_id),
         job_posting_id   = COALESCE(EXCLUDED.job_posting_id, worker_placement_audits.job_posting_id),
         worker_raw_name  = COALESCE(EXCLUDED.worker_raw_name, worker_placement_audits.worker_raw_name),
         patient_raw_name = COALESCE(EXCLUDED.patient_raw_name, worker_placement_audits.patient_raw_name),
         coordinator_name = COALESCE(EXCLUDED.coordinator_name, worker_placement_audits.coordinator_name),
         coordinator_id   = COALESCE(EXCLUDED.coordinator_id, worker_placement_audits.coordinator_id),
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
        coordinatorId,
        dto.caseNumberRaw ?? null,
        dto.rating ?? null,
        dto.observations ?? null,
      ]
    );
    return { created: result.rows[0]?.inserted ?? false };
  }

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
      SET job_posting_id = (
        SELECT jp.id FROM job_postings jp
        WHERE jp.case_number = a.case_number_raw AND jp.deleted_at IS NULL
        ORDER BY jp.created_at ASC LIMIT 1
      )
      WHERE a.job_posting_id IS NULL
        AND a.case_number_raw IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM job_postings jp
          WHERE jp.case_number = a.case_number_raw AND jp.deleted_at IS NULL
        )
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
    const coordinatorId = await resolveCoordinatorId(this.pool, dto.coordinatorName);
    const result = await this.pool.query(
      `INSERT INTO coordinator_weekly_schedules (
         coordinator_id, coordinator_name, coordinator_dni, from_date, to_date, weekly_hours
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (coordinator_id, from_date, to_date) DO UPDATE SET
         coordinator_name = COALESCE(EXCLUDED.coordinator_name, coordinator_weekly_schedules.coordinator_name),
         coordinator_dni  = COALESCE(EXCLUDED.coordinator_dni, coordinator_weekly_schedules.coordinator_dni),
         weekly_hours     = EXCLUDED.weekly_hours,
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        coordinatorId,
        dto.coordinatorName,
        dto.coordinatorDni ?? null,
        dto.fromDate,
        dto.toDate,
        dto.weeklyHours ?? null,
      ]
    );
    return { created: result.rows[0]?.inserted ?? false };
  }

  async findByCoordinatorAndDate(coordinatorName: string, date: Date): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT weekly_hours FROM coordinator_weekly_schedules
       WHERE coordinator_id = (SELECT id FROM coordinators WHERE name ILIKE $1)
         AND from_date <= $2
         AND to_date   >= $2
       ORDER BY from_date DESC LIMIT 1`,
      [coordinatorName, date.toISOString().split('T')[0]]
    );
    return result.rows[0]?.weekly_hours ?? null;
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

  async findExpiringSoon(_daysAhead = 30): Promise<WorkerDocExpiry[]> {
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
