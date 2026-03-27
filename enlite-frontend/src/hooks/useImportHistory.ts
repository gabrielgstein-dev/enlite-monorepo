import { useState, useEffect, useCallback, useRef } from 'react';
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

const baseURL = (import.meta as any).env?.VITE_API_WORKER_FUNCTIONS_URL || 'http://localhost:8080';
const authService = new FirebaseAuthService();

export interface ImportJob {
  id: string;
  filename: string;
  status: 'pending' | 'queued' | 'processing' | 'done' | 'error' | 'cancelled';
  currentPhase: string;
  workersCreated: number;
  encuadresCreated: number;
  encuadresSkipped: number;
  errorRows: number;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  duration: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface HistoryResponse {
  success: boolean;
  data: ImportJob[];
  pagination: Pagination;
}

export interface QueueResponse {
  success: boolean;
  data: {
    running: { jobId: string; filename: string; enqueuedAt: string } | null;
    queued: Array<{ jobId: string; filename: string; position: number; enqueuedAt: string }>;
  };
}

export function useImportHistory() {
  const [loading, setLoading] = useState(false);

  const getHeaders = async (): Promise<HeadersInit> => {
    const token = await authService.getIdToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchHistory = useCallback(async (page: number = 1, limit: number = 20, status?: string): Promise<HistoryResponse> => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const query = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(status ? { status } : {})
      });
      const res = await fetch(`${baseURL}/api/import/history?${query}`, { headers });
      const json = await res.json();
      return json;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async (): Promise<QueueResponse> => {
    const headers = await getHeaders();
    const res = await fetch(`${baseURL}/api/import/queue`, { headers });
    return await res.json();
  }, []);

  const cancelJob = useCallback(async (id: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${baseURL}/api/import/cancel/${id}`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Job not found');
      if (res.status === 409) throw new Error('Job already terminal');
      throw new Error('Failed to cancel job');
    }
    return await res.json();
  }, []);

  return {
    loading,
    fetchHistory,
    fetchQueue,
    cancelJob,
  };
}

export interface StreamLog {
  ts: string;
  level: string;
  message: string;
}

export interface StreamProgress {
  percent?: number;
  processedRows?: number;
  totalRows?: number;
  workersCreated?: number;
  encuadresCreated?: number;
  errorRows?: number;
}

export interface JobStreamState {
  status: ImportJob['status'] | 'connecting';
  phase: string;
  progress: StreamProgress;
  logs: StreamLog[];
  queuePosition?: number;
  error?: string;
  cancelledBy?: string;
  finalStats?: any;
}

export function useJobStream(jobId: string | null) {
  const [state, setState] = useState<JobStreamState>({
    status: 'connecting',
    phase: '',
    progress: {},
    logs: [],
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setState({
      status: 'connecting',
      phase: '',
      progress: {},
      logs: [],
    });

    const connect = async () => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        const token = await authService.getIdToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${baseURL}/api/import/status/${jobId}/stream`, {
          headers,
          signal,
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // linha incompleta

          let currentEvent = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line === '') {
              // Dispatch event if we have data
              if (dataLines.length) {
                try {
                  const payload = JSON.parse(dataLines.join('\n'));
                  
                  setState((prev) => {
                    const next = { ...prev };
                    if (currentEvent === 'phase') {
                      next.phase = payload.phase;
                      // Atualiza status para 'processing' assim que a primeira fase chegar
                      if (next.status === 'connecting') next.status = 'processing';
                    } else if (currentEvent === 'progress') {
                      next.progress = { ...next.progress, ...payload };
                    } else if (currentEvent === 'log') {
                      next.logs = [...next.logs, payload];
                    } else if (currentEvent === 'queued') {
                      next.status = 'queued';
                      next.queuePosition = payload.position;
                    } else if (currentEvent === 'complete') {
                      // Usa o status real do job (pode ser 'error' se houve violação de constraint silenciosa)
                      next.status = (payload.status === 'error') ? 'error' : 'done';
                      next.finalStats = payload;
                      // Atualiza phase com o valor final do job
                      if (payload.currentPhase) next.phase = payload.currentPhase;
                      // Fallback: se não recebeu log events (job já estava done ao conectar),
                      // usa os logs embutidos no payload do complete
                      if (next.logs.length === 0 && Array.isArray(payload.logs) && payload.logs.length > 0) {
                        next.logs = payload.logs;
                      }
                    } else if (currentEvent === 'error') {
                      next.status = 'error';
                      next.error = payload.message;
                      // Injeta o erro como linha de log para aparecer no terminal panel
                      if (payload.message) {
                        next.logs = [...next.logs, {
                          ts: new Date().toISOString(),
                          level: 'error',
                          message: payload.message,
                        }];
                      }
                    } else if (currentEvent === 'cancelled') {
                      next.status = 'cancelled';
                      next.cancelledBy = payload.by;
                    }
                    return next;
                  });

                  if (['complete', 'error', 'cancelled'].includes(currentEvent)) {
                    reader.cancel();
                    return; // exit loop
                  }
                } catch (e) {
                  console.error('Error parsing SSE data', e);
                }
              }
              currentEvent = 'message'; // reset
              dataLines.length = 0;
            } else if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('SSE Error:', err);
          setState(s => ({ ...s, status: 'error', error: 'Connection failed' }));
        }
      }
    };

    connect();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [jobId]);

  return state;
}

