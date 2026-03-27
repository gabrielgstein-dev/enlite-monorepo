import { Result } from '@domain/shared/Result';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnection';

export interface UserComplete {
  user: {
    firebase_uid: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
    role: string;
    is_active: boolean;
    email_verified: boolean;
    created_at: Date;
    updated_at: Date;
  };
  role_data?: any;
  service_areas?: any[];
  availability?: any[];
}

export class GetUserCompleteUseCase {
  private db = DatabaseConnection.getInstance();

  async execute(firebaseUid: string): Promise<Result<UserComplete>> {
    const client = await this.db.getPool().connect();
    
    try {
      const result = await client.query(
        'SELECT get_user_complete($1) as data',
        [firebaseUid]
      );
      
      if (!result.rows[0]?.data) {
        return Result.fail('User not found');
      }
      
      return Result.ok(result.rows[0].data);
      
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error.message : 'Failed to get user data'
      );
    } finally {
      client.release();
    }
  }
}
