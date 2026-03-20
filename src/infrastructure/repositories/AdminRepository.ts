import { Pool, PoolClient } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

export interface AdminRecord {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  role: string;
  department: string | null;
  accessLevel: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}

export class AdminRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async findByFirebaseUid(uid: string): Promise<AdminRecord | null> {
    const result = await this.pool.query(
      `SELECT
        u.firebase_uid as "firebaseUid",
        u.id,
        u.email,
        u.display_name as "displayName",
        u.role,
        ae.department,
        ae.access_level as "accessLevel",
        ae.must_change_password as "mustChangePassword",
        ae.last_login_at as "lastLoginAt",
        ae.login_count as "loginCount",
        u.created_at as "createdAt"
      FROM users u
      JOIN admins_extension ae ON ae.user_id = u.firebase_uid
      WHERE u.firebase_uid = $1 AND u.role = 'admin'`,
      [uid]
    );
    return result.rows[0] ?? null;
  }

  async listAdmins(limit = 50, offset = 0): Promise<{ admins: AdminRecord[]; total: number }> {
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND is_active = true`
    );

    const result = await this.pool.query(
      `SELECT
        u.firebase_uid as "firebaseUid",
        u.id,
        u.email,
        u.display_name as "displayName",
        u.role,
        ae.department,
        ae.access_level as "accessLevel",
        ae.must_change_password as "mustChangePassword",
        ae.last_login_at as "lastLoginAt",
        ae.login_count as "loginCount",
        u.created_at as "createdAt"
      FROM users u
      JOIN admins_extension ae ON ae.user_id = u.firebase_uid
      WHERE u.role = 'admin' AND u.is_active = true
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { admins: result.rows, total: parseInt(countResult.rows[0].total) };
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as total FROM users WHERE role = 'admin'`
    );
    return parseInt(result.rows[0].total);
  }

  async updateMustChangePassword(firebaseUid: string, value: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE admins_extension SET must_change_password = $2
       WHERE user_id = (SELECT id FROM users WHERE firebase_uid = $1)`,
      [firebaseUid, value]
    );
  }

  async updateLastLogin(firebaseUid: string): Promise<void> {
    await this.pool.query(
      `UPDATE admins_extension
       SET last_login_at = NOW(), login_count = login_count + 1
       WHERE user_id = (SELECT id FROM users WHERE firebase_uid = $1)`,
      [firebaseUid]
    );
  }

  async deleteByFirebaseUid(firebaseUid: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM users WHERE firebase_uid = $1`,
      [firebaseUid]
    );
  }
}
