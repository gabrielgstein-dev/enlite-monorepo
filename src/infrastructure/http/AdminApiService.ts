import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { AdminUser } from '@domain/entities/AdminUser';

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

class AdminApiServiceClass {
  private readonly authService = new FirebaseAuthService();
  private readonly baseURL: string;

  constructor() {
    this.baseURL = (import.meta as any).env?.VITE_API_WORKER_FUNCTIONS_URL
      || 'http://localhost:8080';
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getIdToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json: ApiResponse<T> = await response.json();

    if (!json.success) {
      throw new Error((json as ApiErrorResponse).error || `HTTP ${response.status}`);
    }
    return (json as ApiSuccessResponse<T>).data;
  }

  async getProfile(): Promise<AdminUser> {
    return this.request<AdminUser>('GET', '/api/admin/auth/profile');
  }

  async changePassword(newPassword: string): Promise<void> {
    await this.request<unknown>('POST', '/api/admin/auth/change-password', { newPassword });
  }

  async createAdmin(data: { email: string; displayName: string; department?: string }): Promise<AdminUser> {
    return this.request<AdminUser>('POST', '/api/admin/users', data);
  }

  async listAdmins(limit = 50, offset = 0): Promise<{ admins: AdminUser[]; total: number }> {
    const result = await this.request<AdminUser[]>('GET', `/api/admin/users?limit=${limit}&offset=${offset}`);
    // The endpoint wraps admins in data + pagination
    return { admins: result as any, total: (result as any).length };
  }

  async deleteAdmin(firebaseUid: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/users/${firebaseUid}`);
  }

  async resetPassword(firebaseUid: string): Promise<void> {
    await this.request<unknown>('POST', `/api/admin/users/${firebaseUid}/reset-password`);
  }
}

export const AdminApiService = new AdminApiServiceClass();
