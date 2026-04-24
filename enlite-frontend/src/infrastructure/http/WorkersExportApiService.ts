/**
 * WorkersExportApiService.ts
 *
 * Isolated service for the binary-download export endpoint.
 * Extracted from AdminApiService to keep it within the 400-line limit.
 *
 * Usage: call WorkersExportApiService.exportWorkers(params) — it is
 * pre-instantiated with the shared Firebase auth service and base URL.
 */
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

export interface WorkerExportParams {
  format: 'csv' | 'xlsx';
  columns: string[];
  status?: string;
  platform?: string;
  docs_complete?: string;
  docs_validated?: string;
  search?: string;
  case_id?: string;
}

class WorkersExportApiServiceClass {
  private readonly authService = new FirebaseAuthService();
  private readonly baseURL: string;

  constructor() {
    this.baseURL =
      (import.meta as any).env?.VITE_API_WORKER_FUNCTIONS_URL ||
      'http://localhost:8080';
  }

  async exportWorkers(params: WorkerExportParams): Promise<void> {
    const token = await this.authService.getIdToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const query = new URLSearchParams();
    query.set('format', params.format);
    query.set('columns', params.columns.join(','));
    if (params.status)         query.set('status',         params.status);
    if (params.platform)       query.set('platform',       params.platform);
    if (params.docs_complete)  query.set('docs_complete',  params.docs_complete);
    if (params.docs_validated) query.set('docs_validated', params.docs_validated);
    if (params.search)         query.set('search',         params.search);
    if (params.case_id)        query.set('case_id',        params.case_id);

    const response = await fetch(
      `${this.baseURL}/api/admin/workers/export?${query}`,
      { method: 'GET', headers },
    );

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const json = await response.json();
        if (json?.error) errMsg = json.error;
      } catch { /* ignore body parse errors on non-JSON error responses */ }
      throw new Error(errMsg);
    }

    const blob = await response.blob();

    // Prefer filename from Content-Disposition; fall back to date-stamped name
    const disposition = response.headers.get('content-disposition') ?? '';
    let filename = `workers_${new Date().toISOString().slice(0, 10)}.${params.format}`;
    const match = disposition.match(/filename="?([^";\n]+)"?/i);
    if (match?.[1]) filename = match[1].trim();

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }
}

export const WorkersExportApiService = new WorkersExportApiServiceClass();
