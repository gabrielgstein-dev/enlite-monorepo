/**
 * AdminVacancyParseApiService
 *
 * Handles vacancy AI-parsing endpoints and patient address creation.
 * Extracted from AdminApiService to keep each file under 400 lines.
 */

import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import type {
  ParseVacancyFullResult,
  PatientAddressCreateInput,
  PatientAddressRow,
} from '@domain/entities/PatientAddress';

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

class AdminVacancyParseApiServiceClass {
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

  async parseVacancyFull(file: File, workerType: 'AT' | 'CUIDADOR'): Promise<ParseVacancyFullResult> {
    const token = await this.authService.getIdToken();
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('workerType', workerType);

    const response = await fetch(`${this.baseURL}/api/admin/vacancies/parse`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const json = await response.json();
    if (!json.success) throw new Error(json.error || `HTTP ${response.status}`);
    return json.data as ParseVacancyFullResult;
  }

  // ========== Patient Address ==========

  async createPatientAddress(
    patientId: string,
    data: PatientAddressCreateInput,
  ): Promise<PatientAddressRow> {
    return this.request<PatientAddressRow>(
      'POST',
      `/api/admin/patients/${patientId}/addresses`,
      data,
    );
  }
}

export const AdminVacancyParseApiService = new AdminVacancyParseApiServiceClass();
