/**
 * AdminWorkerDocsApiService
 *
 * Handles worker document operations (primary + additional docs, GCS uploads).
 * Extracted from AdminApiService to keep each file under the 400-line limit.
 * Callers continue to use `AdminApiService` — it delegates here transparently.
 */
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { WorkerDocument, DocumentValidations } from '@domain/entities/Worker';

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

export class AdminWorkerDocsApiServiceClass {
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

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

  // ========== Worker Documents (Admin Upload) ==========

  async getWorkerDocUploadUrl(
    workerId: string, docType: string, contentType: string,
  ): Promise<{ signedUrl: string; filePath: string }> {
    return this.request('POST', `/api/admin/workers/${workerId}/documents/upload-url`, { docType, contentType });
  }

  async saveWorkerDocPath(workerId: string, docType: string, filePath: string): Promise<WorkerDocument> {
    return this.request<WorkerDocument>('POST', `/api/admin/workers/${workerId}/documents/save`, { docType, filePath });
  }

  async getWorkerDocViewUrl(workerId: string, filePath: string): Promise<string> {
    const result = await this.request<{ signedUrl: string }>(
      'POST', `/api/admin/workers/${workerId}/documents/view-url`, { filePath },
    );
    return result.signedUrl;
  }

  async deleteWorkerDoc(workerId: string, docType: string): Promise<WorkerDocument> {
    return this.request<WorkerDocument>('DELETE', `/api/admin/workers/${workerId}/documents/${docType}`);
  }

  async validateWorkerDoc(workerId: string, docType: string): Promise<DocumentValidations> {
    const res = await this.request<{ documentValidations: DocumentValidations }>(
      'POST', `/api/admin/workers/${workerId}/documents/${docType}/validate`,
    );
    return res.documentValidations ?? {};
  }

  async invalidateWorkerDoc(workerId: string, docType: string): Promise<DocumentValidations> {
    const res = await this.request<{ documentValidations: DocumentValidations }>(
      'DELETE', `/api/admin/workers/${workerId}/documents/${docType}/validate`,
    );
    return res.documentValidations ?? {};
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
    return this.request<AdminAdditionalDocument[]>(
      'GET', `/api/admin/workers/${workerId}/additional-documents`,
    );
  }

  async getWorkerAdditionalDocUploadUrl(
    workerId: string, contentType: string,
  ): Promise<{ signedUrl: string; filePath: string }> {
    return this.request(
      'POST', `/api/admin/workers/${workerId}/additional-documents/upload-url`, { contentType },
    );
  }

  async saveWorkerAdditionalDoc(
    workerId: string, label: string, filePath: string,
  ): Promise<AdminAdditionalDocument> {
    return this.request(
      'POST', `/api/admin/workers/${workerId}/additional-documents`, { label, filePath },
    );
  }

  async deleteWorkerAdditionalDoc(workerId: string, docId: string): Promise<void> {
    await this.request<unknown>(
      'DELETE', `/api/admin/workers/${workerId}/additional-documents/${docId}`,
    );
  }
}

export const AdminWorkerDocsApiService = new AdminWorkerDocsApiServiceClass();
