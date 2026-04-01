import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

export interface AdminRecord {
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

  /**
   * Finds any staff member (admin | recruiter | community_manager) by Firebase UID.
   * Only admins have an admins_extension row; other roles get safe defaults.
   */
  async findByFirebaseUid(uid: string): Promise<AdminRecord | null> {
    const result = await this.pool.query(
      `SELECT
        u.firebase_uid                         AS "firebaseUid",
        u.email,
        u.display_name                         AS "displayName",
        u.role,
        ae.department,
        COALESCE(ae.access_level, 1)           AS "accessLevel",
        COALESCE(ae.must_change_password, false) AS "mustChangePassword",
        ae.last_login_at                       AS "lastLoginAt",
        COALESCE(ae.login_count, 0)            AS "loginCount",
        u.created_at                           AS "createdAt"
      FROM users u
      LEFT JOIN admins_extension ae ON ae.user_id = u.firebase_uid AND u.role = 'admin'
      WHERE u.firebase_uid = $1
        AND u.role IN ('admin', 'recruiter', 'community_manager')`,
      [uid]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Lists all staff members (admin | recruiter | community_manager) with pagination.
   */
  async listAdmins(limit = 50, offset = 0): Promise<{ admins: AdminRecord[]; total: number }> {
    const countResult = await this.pool.query(
      `SELECT COUNT(*) AS total FROM users
       WHERE role IN ('admin', 'recruiter', 'community_manager') AND is_active = true`
    );

    const result = await this.pool.query(
      `SELECT
        u.firebase_uid                         AS "firebaseUid",
        u.email,
        u.display_name                         AS "displayName",
        u.role,
        ae.department,
        COALESCE(ae.access_level, 1)           AS "accessLevel",
        COALESCE(ae.must_change_password, false) AS "mustChangePassword",
        ae.last_login_at                       AS "lastLoginAt",
        COALESCE(ae.login_count, 0)            AS "loginCount",
        u.created_at                           AS "createdAt"
      FROM users u
      LEFT JOIN admins_extension ae ON ae.user_id = u.firebase_uid AND u.role = 'admin'
      WHERE u.role IN ('admin', 'recruiter', 'community_manager') AND u.is_active = true
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { admins: result.rows, total: parseInt(countResult.rows[0].total) };
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`
    );
    return parseInt(result.rows[0].total);
  }

  async updateMustChangePassword(firebaseUid: string, value: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE admins_extension SET must_change_password = $2 WHERE user_id = $1`,
      [firebaseUid, value]
    );
  }

  async updateLastLogin(firebaseUid: string): Promise<void> {
    await this.pool.query(
      `UPDATE admins_extension
       SET last_login_at = NOW(), login_count = login_count + 1
       WHERE user_id = $1`,
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
