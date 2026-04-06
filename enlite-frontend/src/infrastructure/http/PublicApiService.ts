import type { PublicVacancyDetail } from '@domain/entities/Vacancy';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

class PublicApiServiceClass {
  private readonly baseURL: string;

  constructor() {
    this.baseURL =
      (import.meta as any).env?.VITE_API_WORKER_FUNCTIONS_URL || 'http://localhost:8080';
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 404) {
      throw new VacancyNotFoundError();
    }

    const json: ApiResponse<T> = await response.json();

    if (!json.success) {
      throw new Error((json as ApiError).error || `HTTP ${response.status}`);
    }

    return (json as ApiSuccess<T>).data;
  }

  /**
   * GET /api/vacancies/:id
   * Returns public vacancy details without authentication.
   * Throws VacancyNotFoundError when the vacancy does not exist.
   */
  async getVacancy(id: string): Promise<PublicVacancyDetail> {
    return this.request<PublicVacancyDetail>(`/api/vacancies/${id}`);
  }
}

export class VacancyNotFoundError extends Error {
  constructor() {
    super('Vacancy not found');
    this.name = 'VacancyNotFoundError';
  }
}

export const PublicApiService = new PublicApiServiceClass();
