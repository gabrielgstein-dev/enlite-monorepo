import { Result } from '@shared/utils/Result';
import { EmailService } from '../infrastructure/EmailService';
import * as admin from 'firebase-admin';

export class ResetAdminPasswordUseCase {
  private emailService = new EmailService();

  async execute(firebaseUid: string): Promise<Result<{ resetLink: string }>> {
    try {
      // 1. Fetch Firebase user to get email and displayName
      const firebaseUser = await admin.auth().getUser(firebaseUid);
      const email = firebaseUser.email;

      if (!email) {
        return Result.fail('User has no email address');
      }

      const displayName = firebaseUser.displayName || email.split('@')[0];

      // 2. Generate Firebase password reset link (no temp password, no must_change_password)
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      // 3. Send reset email with the link (non-fatal)
      await this.emailService.sendPasswordResetEmail(email, displayName, resetLink).catch(
        (emailErr) => {
          console.error('Password reset link generated but email failed:', (emailErr as Error).message);
        }
      );

      return Result.ok({ resetLink });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to reset admin password'
      );
    }
  }
}
