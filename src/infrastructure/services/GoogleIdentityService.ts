import { Result } from '../../domain/shared/Result';

/**
 * Service for interacting with Google Cloud Identity Platform
 * HIPAA Compliance: No PII logging
 */
export class GoogleIdentityService {
  private apiKey: string;
  private projectId: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_IDENTITY_API_KEY || '';
    this.projectId = process.env.GCP_PROJECT_ID || '';
  }

  /**
   * Delete a user from Google Identity Platform
   * Uses Identity Toolkit API to delete user by local ID (authUid)
   * 
   * @param authUid - The Firebase/GCP Identity UID
   * @returns Result<void>
   */
  async deleteUser(authUid: string): Promise<Result<void>> {
    try {
      if (!this.apiKey || !this.projectId) {
        return Result.fail<void>('Google Identity credentials not configured');
      }

      // Identity Toolkit API endpoint for deleting accounts
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          localId: authUid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        
        // If user not found, we can consider it a success (already deleted)
        if (errorMessage.includes('NOT_FOUND') || response.status === 404) {
          return Result.ok<void>();
        }
        
        return Result.fail<void>(`Failed to delete user from Identity Platform: ${errorMessage}`);
      }

      return Result.ok<void>();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return Result.fail<void>(`Failed to delete user from Identity Platform: ${errorMessage}`);
    }
  }

  /**
   * Delete a user from Google Identity Platform by email
   * Uses Identity Toolkit API to lookup user by email and delete
   * 
   * @param email - The user's email address
   * @returns Result<void>
   */
  async deleteUserByEmail(email: string): Promise<Result<void>> {
    try {
      if (!this.apiKey || !this.projectId) {
        return Result.fail<void>('Google Identity credentials not configured');
      }

      // First, lookup user by email to get the localId
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${this.apiKey}`;

      const lookupResponse = await fetch(lookupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: [email],
        }),
      });

      if (!lookupResponse.ok) {
        const errorData = await lookupResponse.json() as { error?: { message?: string } };
        const errorMessage = errorData.error?.message || `HTTP ${lookupResponse.status}`;
        
        // If user not found, consider it success (already deleted)
        if (errorMessage.includes('USER_NOT_FOUND') || lookupResponse.status === 404) {
          return Result.ok<void>();
        }
        
        return Result.fail<void>(`Failed to lookup user: ${errorMessage}`);
      }

      const lookupData = await lookupResponse.json() as { users?: Array<{ localId: string }> };
      
      if (!lookupData.users || lookupData.users.length === 0) {
        // User not found, consider it success
        return Result.ok<void>();
      }

      const localId = lookupData.users[0].localId;

      // Now delete the user by localId
      return await this.deleteUser(localId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return Result.fail<void>(`Failed to delete user by email: ${errorMessage}`);
    }
  }
}
