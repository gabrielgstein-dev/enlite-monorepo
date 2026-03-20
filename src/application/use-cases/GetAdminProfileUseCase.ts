import { Result } from '../../domain/shared/Result';
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository';

export class GetAdminProfileUseCase {
  private adminRepo = new AdminRepository();

  async execute(firebaseUid: string): Promise<Result<any>> {
    try {
      const adminRecord = await this.adminRepo.findByFirebaseUid(firebaseUid);
      if (!adminRecord) {
        return Result.fail('Admin user not found');
      }

      // Update last login
      await this.adminRepo.updateLastLogin(firebaseUid);

      return Result.ok(adminRecord);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to get admin profile'
      );
    }
  }
}
