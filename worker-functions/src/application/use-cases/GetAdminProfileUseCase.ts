import { Result } from '../../domain/shared/Result';
import { AdminRepository, AdminRecord } from '../../infrastructure/repositories/AdminRepository';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import * as admin from 'firebase-admin';

export class GetAdminProfileUseCase {
  private adminRepo = new AdminRepository();
  private db = DatabaseConnection.getInstance();

  async execute(firebaseUid: string): Promise<Result<any>> {
    try {
      let adminRecord = await this.adminRepo.findByFirebaseUid(firebaseUid);

      if (!adminRecord) {
        adminRecord = await this.autoProvisionIfEligible(firebaseUid);
        if (!adminRecord) {
          return Result.fail('Admin user not found');
        }
      }

      await this.adminRepo.updateLastLogin(firebaseUid);
      return Result.ok(adminRecord);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to get admin profile'
      );
    }
  }

  /**
   * Auto-provisions an admin user for @enlite.health emails on first Google login.
   * Creates the user in the DB and sets Firebase custom claims.
   */
  private async autoProvisionIfEligible(firebaseUid: string): Promise<AdminRecord | null> {
    const firebaseUser = await admin.auth().getUser(firebaseUid);

    if (!firebaseUser.email?.endsWith('@enlite.health')) {
      return null;
    }

    // Set admin custom claim in Firebase
    await admin.auth().setCustomUserClaims(firebaseUid, { role: 'admin' });

    // Create DB records (users + admins_extension)
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT create_user_with_role($1, $2, $3, $4, $5, $6) as data',
        [
          firebaseUid,
          firebaseUser.email,
          firebaseUser.displayName || firebaseUser.email.split('@')[0],
          firebaseUser.photoURL || null,
          'admin',
          JSON.stringify({ department: null }),
        ]
      );

      // Google login users don't need to change password
      await client.query(
        'UPDATE admins_extension SET must_change_password = false WHERE user_id = $1',
        [firebaseUid]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return this.adminRepo.findByFirebaseUid(firebaseUid);
  }
}
