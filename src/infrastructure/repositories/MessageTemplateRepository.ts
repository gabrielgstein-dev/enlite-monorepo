import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { MessageTemplate, UpsertMessageTemplateDTO } from '../../domain/entities/MessageTemplate';

export class MessageTemplateRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  // ─────────────────────────────────────────────────────────────────
  // findBySlug — retorna null se não encontrado ou inativo
  // ─────────────────────────────────────────────────────────────────
  async findBySlug(slug: string): Promise<MessageTemplate | null> {
    const result = await this.pool.query<Record<string, any>>(
      `SELECT * FROM message_templates WHERE slug = $1 AND is_active = true LIMIT 1`,
      [slug],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  // ─────────────────────────────────────────────────────────────────
  // findAll — lista todos; onlyActive=true por padrão
  // ─────────────────────────────────────────────────────────────────
  async findAll(onlyActive = true): Promise<MessageTemplate[]> {
    const result = await this.pool.query<Record<string, any>>(
      onlyActive
        ? `SELECT * FROM message_templates WHERE is_active = true ORDER BY category, slug`
        : `SELECT * FROM message_templates ORDER BY category, slug`,
    );
    return result.rows.map(r => this.mapRow(r));
  }

  // ─────────────────────────────────────────────────────────────────
  // upsert — ON CONFLICT (slug):
  //   name, body, category → sempre sobrescreve (intenção explícita de atualização)
  //   is_active            → sempre sobrescreve (permite reativar/desativar)
  //   updated_at           → sempre NOW()
  // ─────────────────────────────────────────────────────────────────
  async upsert(dto: UpsertMessageTemplateDTO): Promise<{ entity: MessageTemplate; created: boolean }> {
    const result = await this.pool.query<Record<string, any>>(
      `INSERT INTO message_templates (slug, name, body, category, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name       = EXCLUDED.name,
         body       = EXCLUDED.body,
         category   = EXCLUDED.category,
         is_active  = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [
        dto.slug,
        dto.name,
        dto.body,
        dto.category ?? null,
        dto.isActive ?? true,
      ],
    );

    return {
      entity: this.mapRow(result.rows[0]),
      created: result.rows[0].inserted,
    };
  }

  private mapRow(row: Record<string, any>): MessageTemplate {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      body: row.body,
      category: row.category,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
