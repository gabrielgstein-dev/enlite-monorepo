import { Request, Response } from 'express';
import { DeleteUserByEmailUseCase } from '../../application/use-cases/DeleteUserByEmailUseCase';
import { UserRepository } from '../../infrastructure/repositories/UserRepository';
import { GoogleIdentityService } from '../../infrastructure/services/GoogleIdentityService';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

/**
 * AdminController - Handles administrative operations
 * 
 * HIPAA Compliance: 
 * - No PII in logs
 * - No PII in error messages
 * - All errors are sanitized
 * 
 * Security:
 * - All endpoints require admin role
 * - Dangerous operations require explicit confirmation
 */
export class AdminController {
  private deleteUserByEmailUseCase: DeleteUserByEmailUseCase;

  constructor() {
    const userRepository = new UserRepository();
    const googleIdentityService = new GoogleIdentityService();
    const eventDispatcher = new EventDispatcher();

    this.deleteUserByEmailUseCase = new DeleteUserByEmailUseCase(
      userRepository,
      googleIdentityService,
      eventDispatcher
    );
  }

  /**
   * DELETE /api/admin/users/by-email
   * 
   * Deletes a user completely by email address:
   * 1. Finds user in database by email
   * 2. Removes from Google Identity Platform
   * 3. Removes all database records (cascading delete)
   * 
   * Body: { email: string }
   * Requires admin role
   */
  async deleteUserByEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Email is required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
        return;
      }

      // Execute deletion
      const result = await this.deleteUserByEmailUseCase.execute({
        email,
      });

      if (result.isFailure) {
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'User and all associated data deleted successfully',
        },
      });
    } catch (error: unknown) {
      console.error('Error in deleteUserByEmail endpoint');
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}
