import { Result } from '../../domain/shared/Result';
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository';
import * as admin from 'firebase-admin';

export class ChangeAdminPasswordUseCase {
  private adminRepo = new AdminRepository();

  async execute(firebaseUid: string, newPassword: string): Promise<Result<void>> {
    try {
      if (newPassword.length < 8) {
        return Result.fail('Password must be at least 8 characters');
      }

      // 1. Update Firebase password
      await admin.auth().updateUser(firebaseUid, { password: newPassword });

      // 2. Clear must_change_password flag
      await this.adminRepo.updateMustChangePassword(firebaseUid, false);

      return Result.ok();
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to change password'
      );
    }
  }
}
