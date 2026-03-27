import { User } from '../entities/User';

export interface CreateUserWithRoleInput {
  firebaseUid: string;
  email: string;
  role: string;
  displayName?: string | null;
  photoUrl?: string | null;
  idToken: string;
}

export interface IUserRepository {
  createUserWithRole(input: CreateUserWithRoleInput): Promise<User>;
}
