import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { AdminUser } from '@domain/entities/AdminUser';
import type {
  MatchResultsResponse,
  MatchResult,
  MessageTemplate,
  WhatsAppSentResult,
} from '../../types/match';

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

  // ========== Recruitment Dashboard Methods ==========
  async getClickUpCases(filters?: { startDate?: string; endDate?: string; status?: string }): Promise<any[]> {
    const params = new URLSearchParams(filters as any);
    return this.request<any[]>('GET', `/api/admin/recruitment/clickup-cases?${params}`);
  }

  async getTalentumWorkers(filters?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const params = new URLSearchParams(filters as any);
    return this.request<any[]>('GET', `/api/admin/recruitment/talentum-workers?${params}`);
  }

  async getProgresoWorkers(filters?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const params = new URLSearchParams(filters as any);
    return this.request<any[]>('GET', `/api/admin/recruitment/progreso?${params}`);
  }

  async getPublications(filters?: { startDate?: string; endDate?: string; caseNumber?: string }): Promise<any[]> {
    const params = new URLSearchParams(filters as any);
    return this.request<any[]>('GET', `/api/admin/recruitment/publications?${params}`);
  }

  async getEncuadres(filters?: { startDate?: string; endDate?: string; caseNumber?: string; resultado?: string }): Promise<any[]> {
    const params = new URLSearchParams(filters as any);
    return this.request<any[]>('GET', `/api/admin/recruitment/encuadres?${params}`);
  }

  async getGlobalMetrics(filters?: { startDate?: string; endDate?: string }): Promise<any> {
    const params = new URLSearchParams(filters as any);
    return this.request<any>('GET', `/api/admin/recruitment/global-metrics?${params}`);
  }

  async getCaseAnalysis(caseNumber: string): Promise<any> {
    return this.request<any>('GET', `/api/admin/recruitment/case/${caseNumber}`);
  }

  async getZoneAnalysis(): Promise<any> {
    return this.request<any>('GET', '/api/admin/recruitment/zones');
  }

  async calculateReemplazos(): Promise<any> {
    return this.request<any>('POST', '/api/admin/recruitment/calculate-reemplazos');
  }

  // ========== Vacancies Methods ==========
  async listVacancies(filters?: { search?: string; client?: string; status?: string; limit?: string; offset?: string }): Promise<{ data: any[]; total: number }> {
    const params = new URLSearchParams(filters as any);
    const headers = await this.getAuthHeaders();
    const url = `${this.baseURL}/api/admin/vacancies?${params}`;
    
    console.log('[AdminApiService.listVacancies] Request URL:', url);
    console.log('[AdminApiService.listVacancies] Filters:', filters);
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    console.log('[AdminApiService.listVacancies] Response status:', response.status);

    const json = await response.json();

    console.log('[AdminApiService.listVacancies] Raw JSON response:', json);
    console.log('[AdminApiService.listVacancies] json.success:', json.success);
    console.log('[AdminApiService.listVacancies] json.data type:', typeof json.data);
    console.log('[AdminApiService.listVacancies] json.data length:', json.data?.length);
    console.log('[AdminApiService.listVacancies] json.total:', json.total);

    if (!json.success) {
      throw new Error(json.error || `HTTP ${response.status}`);
    }
    
    // A API retorna { success: true, data: [...], total: 178, limit: 20, offset: 0 }
    const result = {
      data: json.data,
      total: json.total
    };
    
    console.log('[AdminApiService.listVacancies] Returning:', result);
    
    return result;
  }

  async getVacanciesStats(): Promise<any[]> {
    return this.request<any[]>('GET', '/api/admin/vacancies/stats');
  }

  async getVacancyById(id: string): Promise<any> {
    return this.request<any>('GET', `/api/admin/vacancies/${id}`);
  }

  async createVacancy(data: any): Promise<any> {
    return this.request<any>('POST', '/api/admin/vacancies', data);
  }

  async updateVacancy(id: string, data: any): Promise<any> {
    return this.request<any>('PUT', `/api/admin/vacancies/${id}`, data);
  }

  async deleteVacancy(id: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/vacancies/${id}`);
  }

  // ========== Match Methods ==========

  /** Busca resultados salvos do último match (sem re-rodar LLM) */
  async getMatchResults(vacancyId: string, limit = 50, offset = 0): Promise<MatchResultsResponse> {
    return this.request<MatchResultsResponse>(
      'GET',
      `/api/admin/vacancies/${vacancyId}/match-results?limit=${limit}&offset=${offset}`
    );
  }

  /** Dispara novo match completo (lento — chama LLM via Groq) */
  async triggerMatch(
    vacancyId: string,
    options?: { topN?: number; radiusKm?: number; excludeActive?: boolean }
  ): Promise<MatchResult> {
    const params = new URLSearchParams();
    if (options?.topN       !== undefined) params.set('top_n',          String(options.topN));
    if (options?.radiusKm   !== undefined) params.set('radius_km',      String(options.radiusKm));
    if (options?.excludeActive)            params.set('exclude_active',  'true');
    const qs = params.toString();
    return this.request<MatchResult>('POST', `/api/admin/vacancies/${vacancyId}/match${qs ? `?${qs}` : ''}`);
  }

  /** Envia WhatsApp para um worker (registra jobPostingId para rastrear messaged_at) */
  async sendWhatsApp(
    workerId: string,
    templateSlug: string,
    variables: Record<string, string>,
    jobPostingId?: string
  ): Promise<WhatsAppSentResult> {
    return this.request<WhatsAppSentResult>('POST', '/api/admin/messaging/whatsapp', {
      workerId,
      templateSlug,
      variables,
      ...(jobPostingId ? { jobPostingId } : {}),
    });
  }

  /** Lista templates de mensagem ativos */
  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return this.request<MessageTemplate[]>('GET', '/api/admin/messaging/templates');
  }

  /** Re-parseia campos LLM da vaga via POST /enrich */
  async enrichVacancy(vacancyId: string): Promise<void> {
    await this.request<unknown>('POST', `/api/admin/vacancies/${vacancyId}/enrich`);
  }
}

export const AdminApiService = new AdminApiServiceClass();
