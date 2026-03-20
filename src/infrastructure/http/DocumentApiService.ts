import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

export type DocumentType =
  | 'resume_cv'
  | 'identity_document'
  | 'criminal_record'
  | 'professional_registration'
  | 'liability_insurance';

export interface WorkerDocumentsResponse {
  id: string;
  workerId: string;
  resumeCvUrl: string | null;
  identityDocumentUrl: string | null;
  criminalRecordUrl: string | null;
  professionalRegistrationUrl: string | null;
  liabilityInsuranceUrl: string | null;
  documentsStatus: string;
  submittedAt: string | null;
  updatedAt: string;
}

interface ApiSuccess<TData> { success: true; data: TData; }
interface ApiError { success: false; error: string; }
type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

class DocumentApiServiceClass {
  private readonly authService = new FirebaseAuthService();
  private readonly baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_WORKER_FUNCTIONS_URL ?? 'http://localhost:8080';
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getIdToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<TData>(method: string, path: string, body?: unknown): Promise<TData> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json: ApiResponse<TData> = await response.json();
    if (!json.success) throw new Error((json as ApiError).error || `HTTP ${response.status}`);
    return (json as ApiSuccess<TData>).data;
  }

  async getDocuments(): Promise<WorkerDocumentsResponse | null> {
    return this.request<WorkerDocumentsResponse | null>('GET', '/api/workers/me/documents');
  }

  async getUploadSignedUrl(docType: DocumentType): Promise<{ signedUrl: string; filePath: string }> {
    return this.request<{ signedUrl: string; filePath: string }>(
      'POST', '/api/workers/me/documents/upload-url', { docType },
    );
  }

  async uploadFileToGCS(signedUrl: string, file: File): Promise<void> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    if (!response.ok) throw new Error(`GCS upload failed: ${response.status}`);
  }

  async saveDocumentPath(docType: DocumentType, filePath: string): Promise<WorkerDocumentsResponse> {
    return this.request<WorkerDocumentsResponse>(
      'POST', '/api/workers/me/documents/save', { docType, filePath },
    );
  }

  async getViewSignedUrl(filePath: string): Promise<string> {
    const result = await this.request<{ signedUrl: string }>(
      'POST', '/api/workers/me/documents/view-url', { filePath },
    );
    return result.signedUrl;
  }

  async deleteDocument(docType: DocumentType): Promise<void> {
    await this.request<unknown>('DELETE', `/api/workers/me/documents/${docType}`);
  }
}

export const DocumentApiService = new DocumentApiServiceClass();
