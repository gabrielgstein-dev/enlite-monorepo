export interface AdminUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  department: string | null;
  accessLevel: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}
