import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { Publication, CreatePublicationDTO } from '../domain/Publication';

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
    if (filters.country)   { conditions.push(`jp.country = $${idx++}`); values.push(filters.country); }

    const where = conditions.length > 0
      ? `JOIN job_postings jp ON p.job_posting_id = jp.id AND jp.deleted_at IS NULL WHERE ${conditions.join(' AND ')}`
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
       WHERE jp.country = $1
         AND jp.deleted_at IS NULL`,
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
