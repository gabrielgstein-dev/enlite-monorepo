import { EnliteRole } from './EnliteRole';

export interface AdminUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  role: EnliteRole;
  department: string | null;
  accessLevel: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}
