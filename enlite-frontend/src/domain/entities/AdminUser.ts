import { EnliteRole } from './EnliteRole';

export interface AdminUser {
  firebaseUid: string;
  email: string;
  displayName: string | null;
  role: EnliteRole;
  department: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}
