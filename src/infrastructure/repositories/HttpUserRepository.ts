import { IUserRepository, CreateUserWithRoleInput } from '@domain/repositories/IUserRepository';
import { User } from '@domain/entities/User';
import { HttpClient } from '../http/HttpClient';

export class HttpUserRepository implements IUserRepository {
  constructor(private readonly httpClient: HttpClient) {}

  async createUserWithRole(input: CreateUserWithRoleInput): Promise<User> {
    const response = await this.httpClient.post<User>(
      '/users/create-with-role',
      {
        firebaseUid: input.firebaseUid,
        email: input.email,
        role: input.role,
        displayName: input.displayName,
        photoUrl: input.photoUrl,
      },
      {
        Authorization: `Bearer ${input.idToken}`,
      }
    );

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Failed to create user with role: ${response.status}`);
    }

    return response.data;
  }
}
