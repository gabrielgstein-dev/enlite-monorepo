import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

/** Shape returned by GET /api/workers/me */
export interface WorkerProgressResponse {
  id: string;
  authUid: string;
  email: string;
  phone?: string;
  whatsappPhone?: string;
  lgpdConsentAt?: string;
  currentStep: number;
  status: string;
  country: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /api/workers/init */
export interface InitWorkerPayload {
  authUid: string;
  email: string;
  phone?: string;
  whatsappPhone?: string;
  lgpdOptIn?: boolean;
  country?: string;
}

/** Payload for PUT /api/workers/step */
export interface SaveStepPayload {
  workerId: string;
  step: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
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

class WorkerApiServiceClass {
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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
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

  /**
   * POST /api/workers/init
   * Initialises the worker record on first registration.
   * Idempotent — if worker already exists, returns existing record.
   */
  async initWorker(payload: InitWorkerPayload): Promise<WorkerProgressResponse> {
    return this.request<WorkerProgressResponse>('POST', '/api/workers/init', payload);
  }

  /**
   * GET /api/workers/me
   * Returns the current authenticated worker's progress and data.
   * Throws if worker not found (404 from server becomes Error).
   */
  async getProgress(): Promise<WorkerProgressResponse> {
    return this.request<WorkerProgressResponse>('GET', '/api/workers/me');
  }

  /**
   * PUT /api/workers/step
   * Saves the data for a specific registration step and advances currentStep.
   */
  async saveStep(payload: SaveStepPayload): Promise<void> {
    await this.request<unknown>('PUT', '/api/workers/step', payload);
  }
}

// Singleton instance
export const WorkerApiService = new WorkerApiServiceClass();
