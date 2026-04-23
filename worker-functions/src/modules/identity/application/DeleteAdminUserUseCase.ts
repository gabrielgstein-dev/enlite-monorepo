import { Result } from '@shared/utils/Result';
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository';
import * as admin from 'firebase-admin';

export class DeleteAdminUserUseCase {
  private adminRepo = new AdminRepository();

  async execute(firebaseUid: string): Promise<Result<void>> {
    try {
      // 1. Delete from Firebase
      await admin.auth().deleteUser(firebaseUid);

      // 2. Delete from DB
      await this.adminRepo.deleteByFirebaseUid(firebaseUid);

      return Result.ok();
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to delete admin user'
      );
    }
  }
}
