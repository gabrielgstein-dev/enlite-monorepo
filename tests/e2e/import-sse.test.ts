/**
 * import-sse.test.ts
 *
 * Testa a Fase 3 do roadmap de Upload Status:
 *  - GET /api/import/status/:id/stream → SSE em tempo real
 *
 * Usa o módulo `http` nativo do Node.js para consumir SSE
 * (EventSource de browser não suporta header Authorization).
 *
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

import * as http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const API_BASE = process.env.API_URL || 'http://localhost:8080';
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const SSE_TIMEOUT_MS = 20_000;

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Consome um stream SSE via http nativo até receber um evento terminal
 * (complete | error) ou atingir o timeout.
 * Retorna todos os eventos coletados.
 */
function consumeSseUntilTerminal(
  path: string,
  authToken: string,
  timeoutMs = SSE_TIMEOUT_MS,
): Promise<SseEvent[]> {
  return new Promise((resolve, reject) => {
    const events: SseEvent[] = [];
    const parsedUrl = new URL(API_BASE);

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || '80', 10),
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    };

    const req = http.request(options, (res) => {
      // SSE retorna 200 com Content-Type text/event-stream
      // (erros como 404 também chegam como SSE event, não HTTP 4xx)
      let buf = '';
      let currentEvent = 'message';
      const dataLines: string[] = [];

      const timer = setTimeout(() => {
        req.destroy();
        resolve(events);
      }, timeoutMs);

      const done = (): void => {
        clearTimeout(timer);
        req.destroy();
        resolve(events);
      };

      res.setEncoding('utf-8');

      res.on('data', (chunk: string) => {
        buf += chunk;
        let nl: number;
        // Processa linha a linha
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);

          if (line === '') {
            // Linha em branco → dispatcha evento acumulado
            if (dataLines.length > 0) {
              try {
                const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
                events.push({ event: currentEvent, data });
                if (currentEvent === 'complete' || currentEvent === 'error' || currentEvent === 'cancelled') {
                  done();
                  return;
                }
              } catch {
                // JSON inválido — ignora
              }
            }
            currentEvent = 'message';
            dataLines.length = 0;
          } else if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
          // Ignora outras linhas SSE (id:, retry:, comentários)
        }
      });

      res.on('end', () => {
        clearTimeout(timer);
        resolve(events);
      });

      res.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
          resolve(events); // destroy() causa ECONNRESET — é esperado
        } else {
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        resolve(events);
      } else {
        reject(err);
      }
    });

    req.end();
  });
}

function buildMultipartBody(
  filename: string,
  fileBuffer: Buffer,
  mimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = `----FormBoundary${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function uploadFixture(
  api: ReturnType<typeof createApiClient>,
  authToken: string,
  filename: string,
  mimeType: string,
): Promise<{ importJobId: string; streamUrl: string }> {
  const fileBuffer = readFileSync(join(FIXTURES_DIR, filename));
  const { body, contentType } = buildMultipartBody(filename, fileBuffer, mimeType);
  const res = await api.post('/api/import/upload', body, {
    headers: { 'Content-Type': contentType, Authorization: `Bearer ${authToken}` },
  });

  // 202: novo job; 200 alreadyImported: usa o job existente e constrói streamUrl
  if (res.status === 200 && res.data?.alreadyImported) {
    const importJobId = res.data.data.importJobId as string;
    return { importJobId, streamUrl: `/api/import/status/${importJobId}/stream` };
  }

  expect(res.status).toBe(202);
  const data = res.data.data as Record<string, unknown>;
  return {
    importJobId: data.importJobId as string,
    streamUrl: data.streamUrl as string,
  };
}

async function pollUntilDone(
  api: ReturnType<typeof createApiClient>,
  authToken: string,
  importJobId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await api.get(`/api/import/status/${importJobId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = res.data?.data as Record<string, unknown> | undefined;
    if (data && (data.status === 'done' || data.status === 'error')) return data;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Job ${importJobId} did not finish within ${POLL_TIMEOUT_MS}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('SSE Stream (Fase 3)', () => {
  const api = createApiClient();
  let adminToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'sse-admin-e2e',
      email: 'sse@e2e.local',
      role: 'admin',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 4 — response do upload inclui streamUrl
  // ──────────────────────────────────────────────────────────────────────────
  describe('Fase 4 — contrato do endpoint de upload', () => {
    it('POST /upload retorna streamUrl além de statusUrl', async () => {
      const fileBuffer = readFileSync(join(FIXTURES_DIR, 'talentum_sample.csv'));
      const { body, contentType } = buildMultipartBody('talentum_sample_sse_contract.csv', fileBuffer, 'text/csv');
      const res = await api.post('/api/import/upload', body, {
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${adminToken}` },
      });

      // Pode retornar 202 (novo) ou 200 (alreadyImported)
      expect([200, 202]).toContain(res.status);

      if (res.status === 202) {
        const data = res.data.data as Record<string, unknown>;
        expect(typeof data.statusUrl).toBe('string');
        expect(typeof data.streamUrl).toBe('string');
        expect((data.streamUrl as string)).toMatch(/\/api\/import\/status\/.+\/stream$/);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Job inexistente → evento error via SSE
  // ──────────────────────────────────────────────────────────────────────────
  describe('job não encontrado', () => {
    it('retorna evento SSE de error para job inexistente', async () => {
      const events = await consumeSseUntilTerminal(
        '/api/import/status/00000000-0000-0000-0000-000000000000/stream',
        adminToken,
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
      const errorEvent = events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(typeof errorEvent!.data.message).toBe('string');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Job já concluído → replay imediato do DB
  // ──────────────────────────────────────────────────────────────────────────
  describe('replay de job concluído', () => {
    let jobId: string;
    let streamPath: string;

    beforeAll(async () => {
      const { importJobId, streamUrl } = await uploadFixture(
        api, adminToken, 'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      jobId = importJobId;
      streamPath = streamUrl;
      // Espera o job terminar antes de conectar ao stream
      await pollUntilDone(api, adminToken, jobId);
    });

    it('stream de job done emite evento complete', async () => {
      const events = await consumeSseUntilTerminal(streamPath, adminToken);
      const completeEvent = events.find(e => e.event === 'complete');
      expect(completeEvent).toBeDefined();
    });

    it('evento complete tem id, status, currentPhase, progress, results, logs', async () => {
      const events = await consumeSseUntilTerminal(streamPath, adminToken);
      const completeEvent = events.find(e => e.event === 'complete');
      expect(completeEvent).toBeDefined();
      const d = completeEvent!.data;
      expect(typeof d.id).toBe('string');
      expect(d.status).toBe('done');
      expect(d.currentPhase).toBe('done');
      expect(d.progress).toBeDefined();
      expect(d.results).toBeDefined();
      expect(Array.isArray(d.logs)).toBe(true);
    });

    it('progress do complete tem percent, totalRows, processedRows', async () => {
      const events = await consumeSseUntilTerminal(streamPath, adminToken);
      const completeEvent = events.find(e => e.event === 'complete');
      const progress = completeEvent!.data.progress as Record<string, unknown>;
      expect(typeof progress.percent).toBe('number');
      expect(typeof progress.totalRows).toBe('number');
      expect(typeof progress.processedRows).toBe('number');
    });

    it('stream de job done fecha rapidamente (sem timeout)', async () => {
      const start = Date.now();
      const events = await consumeSseUntilTerminal(streamPath, adminToken, 5_000);
      const elapsed = Date.now() - start;
      // Job concluído deve fechar em menos de 5 segundos (replay direto do DB)
      expect(elapsed).toBeLessThan(5_000);
      expect(events.some(e => e.event === 'complete' || e.event === 'error')).toBe(true);
    });

    it('eventos log[] do replay têm ts, level, message', async () => {
      const events = await consumeSseUntilTerminal(streamPath, adminToken);
      const logEvents = events.filter(e => e.event === 'log');
      for (const le of logEvents) {
        expect(typeof le.data.ts).toBe('string');
        expect(['info', 'warn', 'error']).toContain(le.data.level);
        expect(typeof le.data.message).toBe('string');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Stream em tempo real — conecta imediatamente após upload
  // ──────────────────────────────────────────────────────────────────────────
  describe('stream em tempo real (upload → stream imediato)', () => {
    it('planilha_operativa: recebe ao menos complete no stream', async () => {
      const { streamUrl } = await uploadFixture(
        api, adminToken, 'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      // Conecta ao stream imediatamente após upload (job pode ainda estar processando)
      const events = await consumeSseUntilTerminal(streamUrl, adminToken, SSE_TIMEOUT_MS);

      // Independente de ter conectado antes ou depois do job terminar,
      // deve sempre receber um evento terminal
      const hasTerminal = events.some(e => e.event === 'complete' || e.event === 'error');
      expect(hasTerminal).toBe(true);
    });

    it('clickup: eventos recebidos são de tipos válidos', async () => {
      const VALID_EVENT_TYPES = ['phase', 'progress', 'log', 'complete', 'error', 'queued', 'cancelled'];

      const { streamUrl } = await uploadFixture(
        api, adminToken, 'clickup_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const events = await consumeSseUntilTerminal(streamUrl, adminToken, SSE_TIMEOUT_MS);
      expect(events.length).toBeGreaterThanOrEqual(1);
      for (const evt of events) {
        expect(VALID_EVENT_TYPES).toContain(evt.event);
      }
    });

    it('evento phase tem campos phase (válido) e at (ISO timestamp)', async () => {
      const VALID_PHASES = [
        'upload_received', 'parsing', 'importing',
        'post_processing', 'linking', 'dedup', 'done', 'error',
        'queued', 'cancelled',
      ];

      const { streamUrl } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
      );

      const events = await consumeSseUntilTerminal(streamUrl, adminToken, SSE_TIMEOUT_MS);
      const phaseEvents = events.filter(e => e.event === 'phase');

      // Se recebemos eventos de phase, eles devem ter a estrutura correta
      for (const pe of phaseEvents) {
        expect(VALID_PHASES).toContain(pe.data.phase);
        expect(typeof pe.data.at).toBe('string');
        expect(new Date(pe.data.at as string).getTime()).not.toBeNaN();
      }
    });

    it('evento progress tem campos numéricos de progresso', async () => {
      const { streamUrl } = await uploadFixture(
        api, adminToken, 'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const events = await consumeSseUntilTerminal(streamUrl, adminToken, SSE_TIMEOUT_MS);
      const progressEvents = events.filter(e => e.event === 'progress');

      for (const pe of progressEvents) {
        expect(typeof pe.data.percent).toBe('number');
        expect(typeof pe.data.processedRows).toBe('number');
        expect(typeof pe.data.totalRows).toBe('number');
        expect((pe.data.percent as number)).toBeGreaterThanOrEqual(0);
        expect((pe.data.percent as number)).toBeLessThanOrEqual(100);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Autenticação obrigatória
  // ──────────────────────────────────────────────────────────────────────────
  describe('autenticação', () => {
    it('stream sem token retorna 401', async () => {
      // Sem token: o SSE não é aberto, o middleware retorna 401 JSON antes dos headers SSE
      const res = await api.get('/api/import/status/some-id/stream');
      expect(res.status).toBe(401);
    });
  });
});
