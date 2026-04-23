import { Result } from '@shared/utils/Result';
import { AdminRepository } from '../infrastructure/AdminRepository';

export class ListAdminUsersUseCase {
  private adminRepo = new AdminRepository();

  async execute(limit = 50, offset = 0): Promise<Result<any>> {
    try {
      const data = await this.adminRepo.listAdmins(limit, offset);
      return Result.ok(data);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to list admin users'
      );
    }
  }
}
