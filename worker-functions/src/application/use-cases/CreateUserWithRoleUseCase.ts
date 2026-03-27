import { Result } from '@domain/shared/Result';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnection';
import * as admin from 'firebase-admin';

export interface CreateUserInput {
  firebaseUid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  role: 'worker' | 'admin' | 'manager' | 'client' | 'support';
  roleData?: Record<string, any>;
}

export class CreateUserWithRoleUseCase {
  private db = DatabaseConnection.getInstance();

  async execute(input: CreateUserInput): Promise<Result<any>> {
    const client = await this.db.getPool().connect();
    
    try {
      await client.query('BEGIN');
      
      // Call SQL function to create user with role
      const result = await client.query(
        'SELECT create_user_with_role($1, $2, $3, $4, $5, $6) as data',
        [
          input.firebaseUid,
          input.email,
          input.displayName || null,
          input.photoUrl || null,
          input.role,
          JSON.stringify(input.roleData || {})
        ]
      );
      
      // Set custom claims in Firebase Auth
      await admin.auth().setCustomUserClaims(input.firebaseUid, {
        role: input.role
      });
      
      await client.query('COMMIT');
      
      return Result.ok(result.rows[0].data);
      
    } catch (error) {
      await client.query('ROLLBACK');
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to create user'
      );
    } finally {
      client.release();
    }
  }
}
