import { Result } from '../../domain/shared/Result';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository';
import { GmailEmailService } from '../../infrastructure/services/GmailEmailService';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

export interface CreateAdminInput {
  email: string;
  displayName: string;
  department?: string;
}

export class CreateAdminUserUseCase {
  private db = DatabaseConnection.getInstance();
  private adminRepo = new AdminRepository();
  private emailService = new GmailEmailService();

  async execute(input: CreateAdminInput): Promise<Result<any>> {
    const client = await this.db.getPool().connect();
    const tempPassword = crypto.randomBytes(6).toString('base64url'); // ~8 chars
    let firebaseUser: admin.auth.UserRecord | null = null;
    let committed = false;

    try {
      // 1. Create Firebase user with temp password
      firebaseUser = await admin.auth().createUser({
        email: input.email,
        password: tempPassword,
        displayName: input.displayName,
      });

      // 2. Set custom claims
      await admin.auth().setCustomUserClaims(firebaseUser.uid, { role: 'admin' });

      // 3. Create in DB via SQL function (transaction)
      await client.query('BEGIN');

      await client.query(
        'SELECT create_user_with_role($1, $2, $3, $4, $5, $6) as data',
        [
          firebaseUser.uid,
          input.email,
          input.displayName,
          null, // photoUrl
          'admin',
          JSON.stringify({ department: input.department ?? null }),
        ]
      );

      // 4. Ensure must_change_password is true
      await client.query(
        `UPDATE admins_extension SET must_change_password = true
         WHERE user_id = $1`,
        [firebaseUser.uid]
      );

      await client.query('COMMIT');
      committed = true;

      // 5. Send email with temp password (non-fatal: admin already created)
      await this.emailService.sendTempPasswordEmail(
        input.email,
        tempPassword,
        input.displayName
      ).catch((emailErr) => {
        console.error('Admin created but email failed to send:', (emailErr as Error).message);
      });

      return Result.ok({
        firebaseUid: firebaseUser.uid,
        email: input.email,
        displayName: input.displayName,
        department: input.department ?? null,
      });
    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK').catch(() => {});
        if (firebaseUser) {
          await admin.auth().deleteUser(firebaseUser.uid).catch(() => {});
        }
      }
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to create admin user'
      );
    } finally {
      client.release();
    }
  }
}
