import { Result } from '../../domain/shared/Result';
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository';
import { GmailEmailService } from '../../infrastructure/services/GmailEmailService';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

export class ResetAdminPasswordUseCase {
  private adminRepo = new AdminRepository();
  private emailService = new GmailEmailService();

  async execute(firebaseUid: string): Promise<Result<void>> {
    try {
      const tempPassword = crypto.randomBytes(6).toString('base64url');

      // 1. Get admin info for email
      const adminRecord = await this.adminRepo.findByFirebaseUid(firebaseUid);
      if (!adminRecord) {
        return Result.fail('Admin user not found');
      }

      // 2. Update Firebase password
      await admin.auth().updateUser(firebaseUid, { password: tempPassword });

      // 3. Set must_change_password = true
      await this.adminRepo.updateMustChangePassword(firebaseUid, true);

      // 4. Send reset email
      await this.emailService.sendPasswordResetEmail(
        adminRecord.email,
        tempPassword,
        adminRecord.displayName || adminRecord.email
      );

      return Result.ok();
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to reset admin password'
      );
    }
  }
}
