import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { WebhookPartner } from '../../domain/entities/WebhookPartner';
import { IWebhookPartnerRepository } from '../../domain/ports/IWebhookPartnerRepository';

export class WebhookPartnerRepository implements IWebhookPartnerRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async findByDisplayName(displayName: string): Promise<WebhookPartner | null> {
    const result = await this.pool.query(
      `SELECT * FROM webhook_partners
       WHERE display_name = $1 AND is_active = true`,
      [displayName],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findByName(name: string): Promise<WebhookPartner | null> {
    const result = await this.pool.query(
      `SELECT * FROM webhook_partners
       WHERE name = $1 AND is_active = true`,
      [name],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: any): WebhookPartner {
    return {
      id:           row.id,
      name:         row.name,
      displayName:  row.display_name,
      allowedPaths: row.allowed_paths,
      isActive:     row.is_active,
      metadata:     row.metadata,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
    };
  }
}
