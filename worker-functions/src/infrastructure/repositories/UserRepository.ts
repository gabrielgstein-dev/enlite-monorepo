import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { Result } from '@shared/utils/Result';

/**
 * Repository for base users table operations
 * 
 * HIPAA Compliance:
 * - No PII in error messages
 * - All errors sanitized
 */
export class UserRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  /**
   * Delete user from base users table by Firebase UID
   * This cascades to worker_extension and other related tables
   */
  async deleteByFirebaseUid(firebaseUid: string): Promise<Result<void>> {
    try {
      const query = 'DELETE FROM users WHERE firebase_uid = $1';
      await this.pool.query(query, [firebaseUid]);
      
      return Result.ok<void>();
    } catch (error: any) {
      // No PII in error messages
      console.error('Failed to delete user record');
      return Result.fail<void>('Failed to delete user data');
    }
  }

  /**
   * Check if user exists by Firebase UID
   */
  async existsByFirebaseUid(firebaseUid: string): Promise<Result<boolean>> {
    try {
      const query = 'SELECT 1 FROM users WHERE firebase_uid = $1 LIMIT 1';
      const result = await this.pool.query(query, [firebaseUid]);
      
      return Result.ok<boolean>(result.rows.length > 0);
    } catch (error: any) {
      console.error('Failed to check user existence');
      return Result.fail<boolean>('Failed to verify user data');
    }
  }

  /**
   * Find user by email address
   */
  async findByEmail(email: string): Promise<Result<{ firebase_uid: string; email: string; role: string } | null>> {
    try {
      const query = 'SELECT firebase_uid, email, role FROM users WHERE email = $1 LIMIT 1';
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return Result.ok<null>(null);
      }

      return Result.ok<{ firebase_uid: string; email: string; role: string }>(result.rows[0]);
    } catch (error: unknown) {
      console.error('Failed to find user by email');
      return Result.fail<{ firebase_uid: string; email: string; role: string } | null>('Failed to find user');
    }
  }

  /**
   * Transactional delete of user and all related data
   * Ensures atomicity of the deletion operation
   */
  async deleteUserComplete(firebaseUid: string): Promise<Result<void>> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // workers_extension table was dropped — ON DELETE CASCADE on users handles related cleanup.

      // Delete from base users table
      await client.query(
        'DELETE FROM users WHERE firebase_uid = $1 RETURNING firebase_uid',
        [firebaseUid]
      );

      await client.query('COMMIT');

      // Return success even if no rows were deleted (user might not exist in DB)
      return Result.ok<void>();
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Transaction failed during user deletion');
      return Result.fail<void>('Failed to delete user data');
    } finally {
      client.release();
    }
  }
}
