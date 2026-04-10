import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { AdminUser } from '@domain/entities/AdminUser';
import { WorkerDateStats, WorkerDetail } from '@domain/entities/Worker';
import type {
  MatchResultsResponse,
  MessageTemplate,
  WhatsAppSentResult,
} from '../../types/match';
import type { InterviewSlot, CreateSlotsInput, BookSlotResult, InterviewSlotsSummary } from '@domain/entities/InterviewSlot';

export type { WorkerDateStats };

export interface AdminAdditionalDocument {
  id: string;
  workerId: string;
  label: string;
  filePath: string;
  uploadedAt: string;
  createdAt: string;
}

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
    return { admins: result as any, total: (result as any).length };
  }

  async deleteAdmin(firebaseUid: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/users/${firebaseUid}`);
  }

  async resetPassword(firebaseUid: string): Promise<void> {
    await this.request<unknown>('POST', `/api/admin/users/${firebaseUid}/reset-password`);
  }

  // ========== Vacancy AI Parsing ==========
  async parseVacancyFromText(data: { text: string; workerType: 'AT' | 'CUIDADOR' }): Promise<{
    vacancy: Record<string, any>;
    prescreening: { questions: any[]; faq: any[] };
    description: { titulo_propuesta: string; descripcion_propuesta: string; perfil_profesional: string };
  }> {
    return this.request('POST', '/api/admin/vacancies/parse-from-text', data);
  }

  async parseVacancyFromPdf(file: File, workerType: 'AT' | 'CUIDADOR'): Promise<{
    vacancy: Record<string, any>;
    prescreening: { questions: any[]; faq: any[] };
    description: { titulo_propuesta: string; descripcion_propuesta: string; perfil_profesional: string };
  }> {
    const token = await this.authService.getIdToken();
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('workerType', workerType);

    const response = await fetch(`${this.baseURL}/api/admin/vacancies/parse-from-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const json = await response.json();
    if (!json.success) throw new Error(json.error || `HTTP ${response.status}`);
    return json.data;
  }

  // ========== Vacancies Methods ==========
  async listVacancies(filters?: {
    search?: string; client?: string; status?: string; priority?: string; limit?: string; offset?: string;
  }): Promise<{ data: any[]; total: number }> {
    const params = new URLSearchParams(filters as any);
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseURL}/api/admin/vacancies?${params}`, { method: 'GET', headers });
    const json = await response.json();
    if (!json.success) throw new Error(json.error || `HTTP ${response.status}`);
    return { data: json.data, total: json.total };
  }

  async getVacanciesStats(): Promise<any[]> {
    return this.request<any[]>('GET', '/api/admin/vacancies/stats');
  }

  async getNextVacancyNumber(): Promise<number> {
    const data = await this.request<{ nextVacancyNumber: number }>('GET', '/api/admin/vacancies/next-vacancy-number');
    return data.nextVacancyNumber;
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

  async updateVacancyMeetLinks(
    vacancyId: string,
    meetLinks: [string | null, string | null, string | null],
  ): Promise<void> {
    await this.request<unknown>('PUT', `/api/admin/vacancies/${vacancyId}/meet-links`, { meet_links: meetLinks });
  }

  async enrichVacancy(vacancyId: string): Promise<void> {
    await this.request<unknown>('POST', `/api/admin/vacancies/${vacancyId}/enrich`);
  }

  // ========== Match Methods ==========
  async getMatchResults(vacancyId: string, limit = 50, offset = 0): Promise<MatchResultsResponse> {
    return this.request<MatchResultsResponse>(
      'GET',
      `/api/admin/vacancies/${vacancyId}/match-results?limit=${limit}&offset=${offset}`
    );
  }

  async triggerMatch(
    vacancyId: string,
    options?: { topN?: number; radiusKm?: number; excludeActive?: boolean }
  ): Promise<MatchResultsResponse> {
    const params = new URLSearchParams();
    if (options?.topN       !== undefined) params.set('top_n',         String(options.topN));
    if (options?.radiusKm   !== undefined) params.set('radius_km',     String(options.radiusKm));
    if (options?.excludeActive)            params.set('exclude_active', 'true');
    const qs = params.toString();
    return this.request<MatchResultsResponse>('POST', `/api/admin/vacancies/${vacancyId}/match${qs ? `?${qs}` : ''}`);
  }

  async sendWhatsApp(
    workerId: string,
    templateSlug: string,
    variables: Record<string, string>,
    jobPostingId?: string
  ): Promise<WhatsAppSentResult> {
    return this.request<WhatsAppSentResult>('POST', '/api/admin/messaging/whatsapp', {
      workerId, templateSlug, variables, ...(jobPostingId ? { jobPostingId } : {}),
    });
  }

  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return this.request<MessageTemplate[]>('GET', '/api/admin/messaging/templates');
  }

  // ========== Workers Methods ==========
  async listCaseOptions(): Promise<{ value: string; label: string }[]> {
    return this.request<{ value: string; label: string }[]>('GET', '/api/admin/workers/case-options');
  }

  async listWorkers(filters?: {
    platform?: string;
    docs_complete?: string;
    search?: string;
    case_id?: string;
    limit?: string;
    offset?: string;
  }): Promise<{ data: any[]; total: number }> {
    const cleanFilters = Object.fromEntries(
      Object.entries(filters ?? {}).filter(([, v]) => v !== undefined && v !== ''),
    );
    const params = new URLSearchParams(cleanFilters as Record<string, string>);
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseURL}/api/admin/workers?${params}`, { method: 'GET', headers });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Erro ao conectar ao servidor (HTTP ${response.status})`);
    }
    const json = await response.json();
    if (!json.success) throw new Error(json.error || `HTTP ${response.status}`);
    return { data: json.data ?? [], total: json.total ?? 0 };
  }

  async getWorkerById(id: string): Promise<WorkerDetail> {
    return this.request<WorkerDetail>('GET', `/api/admin/workers/${id}`);
  }

  async getWorkerDateStats(): Promise<WorkerDateStats> {
    return this.request<WorkerDateStats>('GET', '/api/admin/workers/stats');
  }

  // ========== Encuadres Methods ==========
  async updateEncuadreResult(
    encuadreId: string,
    data: { resultado: string; rejectionReasonCategory?: string; rejectionReason?: string }
  ): Promise<void> {
    await this.request<unknown>('PUT', `/api/admin/encuadres/${encuadreId}/result`, data);
  }

  async getEncuadreFunnel(vacancyId: string): Promise<unknown> {
    return this.request<unknown>('GET', `/api/admin/vacancies/${vacancyId}/funnel`);
  }

  async moveEncuadre(
    encuadreId: string,
    data: { targetStage: string; rejectionReasonCategory?: string; rejectionReason?: string }
  ): Promise<void> {
    await this.request<unknown>('PUT', `/api/admin/encuadres/${encuadreId}/move`, data);
  }

  // ========== Interview Slots Methods ==========
  async createInterviewSlots(vacancyId: string, data: CreateSlotsInput): Promise<InterviewSlot[]> {
    return this.request<InterviewSlot[]>('POST', `/api/admin/vacancies/${vacancyId}/interview-slots`, data);
  }

  async getInterviewSlots(
    vacancyId: string, status?: string,
  ): Promise<{ slots: InterviewSlot[]; summary: InterviewSlotsSummary }> {
    const qs = status ? `?status=${status}` : '';
    return this.request<{ slots: InterviewSlot[]; summary: InterviewSlotsSummary }>(
      'GET', `/api/admin/vacancies/${vacancyId}/interview-slots${qs}`,
    );
  }

  async bookInterviewSlot(slotId: string, data: { encuadreId: string; sendInvitation?: boolean }): Promise<BookSlotResult> {
    return this.request<BookSlotResult>('POST', `/api/admin/interview-slots/${slotId}/book`, data);
  }

  async cancelInterviewSlot(slotId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/interview-slots/${slotId}`);
  }

  // ========== Talentum Methods ==========
  async syncFromTalentum(opts?: { force?: boolean }): Promise<{
    total: number; updated: number; created: number; skipped: number;
    errors: Array<{ projectId: string; title: string; error: string }>;
  }> {
    const qs = opts?.force ? '?force=true' : '';
    return this.request('POST', `/api/admin/vacancies/sync-talentum${qs}`);
  }

  async publishToTalentum(vacancyId: string): Promise<{ projectId: string; publicId: string; whatsappUrl: string }> {
    return this.request<{ projectId: string; publicId: string; whatsappUrl: string }>(
      'POST', `/api/admin/vacancies/${vacancyId}/publish-talentum`,
    );
  }

  async unpublishFromTalentum(vacancyId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/vacancies/${vacancyId}/publish-talentum`);
  }

  // ========== Social Short Links ==========
  async generateSocialLink(
    vacancyId: string,
    channel: 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'site',
  ): Promise<{ channel: string; shortURL: string; social_short_links: Record<string, { url: string; id: string }> }> {
    return this.request('POST', `/api/admin/vacancies/${vacancyId}/social-links`, { channel });
  }

  async getSocialLinksStats(vacancyId: string): Promise<Record<string, { url: string; clicks: number }>> {
    return this.request('GET', `/api/admin/vacancies/${vacancyId}/social-links-stats`);
  }

  async generateTalentumDescription(vacancyId: string): Promise<{ description: string }> {
    return this.request<{ description: string }>(
      'POST', `/api/admin/vacancies/${vacancyId}/generate-talentum-description`,
    );
  }

  // ========== Prescreening Config Methods ==========
  async getPrescreeningConfig(vacancyId: string): Promise<{ questions: any[]; faq: any[] }> {
    return this.request<{ questions: any[]; faq: any[] }>('GET', `/api/admin/vacancies/${vacancyId}/prescreening-config`);
  }

  async savePrescreeningConfig(
    vacancyId: string, data: { questions: any[]; faq: any[] }
  ): Promise<{ questions: any[]; faq: any[] }> {
    return this.request<{ questions: any[]; faq: any[] }>('POST', `/api/admin/vacancies/${vacancyId}/prescreening-config`, data);
  }

  // ========== Worker Documents (Admin Upload) ==========
  async getWorkerDocUploadUrl(
    workerId: string, docType: string, contentType: string,
  ): Promise<{ signedUrl: string; filePath: string }> {
    return this.request('POST', `/api/admin/workers/${workerId}/documents/upload-url`, { docType, contentType });
  }

  async saveWorkerDocPath(workerId: string, docType: string, filePath: string): Promise<unknown> {
    return this.request('POST', `/api/admin/workers/${workerId}/documents/save`, { docType, filePath });
  }

  async getWorkerDocViewUrl(workerId: string, filePath: string): Promise<string> {
    const result = await this.request<{ signedUrl: string }>(
      'POST', `/api/admin/workers/${workerId}/documents/view-url`, { filePath },
    );
    return result.signedUrl;
  }

  async deleteWorkerDoc(workerId: string, docType: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/workers/${workerId}/documents/${docType}`);
  }

  async uploadWorkerDocToGCS(signedUrl: string, file: File): Promise<void> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new Error(`GCS upload failed: ${response.status}`);
  }

  // ========== Worker Additional Documents (Admin) ==========
  async getWorkerAdditionalDocs(workerId: string): Promise<AdminAdditionalDocument[]> {
    return this.request<AdminAdditionalDocument[]>('GET', `/api/admin/workers/${workerId}/additional-documents`);
  }

  async getWorkerAdditionalDocUploadUrl(
    workerId: string, contentType: string,
  ): Promise<{ signedUrl: string; filePath: string }> {
    return this.request('POST', `/api/admin/workers/${workerId}/additional-documents/upload-url`, { contentType });
  }

  async saveWorkerAdditionalDoc(workerId: string, label: string, filePath: string): Promise<AdminAdditionalDocument> {
    return this.request('POST', `/api/admin/workers/${workerId}/additional-documents`, { label, filePath });
  }

  async deleteWorkerAdditionalDoc(workerId: string, docId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/admin/workers/${workerId}/additional-documents/${docId}`);
  }
}

export const AdminApiService = new AdminApiServiceClass();
