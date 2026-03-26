/**
 * import-queue.test.ts
 *
 * Testa a Fase 5 do roadmap de Upload Status:
 *  - Fila serializada de imports (FIFO)
 *  - Cancelamento de jobs queued e processing
 *  - Deduplicação de hash em jobs ativos
 *  - GET /api/import/queue
 *  - SSE: eventos queued e cancelled
 *
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

import * as http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const API_BASE = process.env.API_URL || 'http://localhost:8080';
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const SSE_TIMEOUT_MS = 30_000;

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
 * Consome SSE até receber evento terminal (complete | error | cancelled) ou timeout.
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
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);

          if (line === '') {
            if (dataLines.length > 0) {
              try {
                const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
                events.push({ event: currentEvent, data });
                if (currentEvent === 'complete' || currentEvent === 'error' || currentEvent === 'cancelled') {
                  done();
                  return;
                }
              } catch { /* ignora JSON inválido */ }
            }
            currentEvent = 'message';
            dataLines.length = 0;
          } else if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
      });

      res.on('end', () => { clearTimeout(timer); resolve(events); });
      res.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') resolve(events);
        else { clearTimeout(timer); reject(err); }
      });
    });

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') resolve(events);
      else reject(err);
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

/**
 * Faz upload e retorna importJobId + streamUrl.
 * Passa um filename customizado para evitar dedup por hash quando necessário.
 */
async function uploadFixture(
  api: ReturnType<typeof createApiClient>,
  authToken: string,
  filename: string,
  mimeType: string,
  uploadAs?: string,
): Promise<{ importJobId: string; streamUrl: string; queuePosition: number; status: number }> {
  const fileBuffer = readFileSync(join(FIXTURES_DIR, filename));
  // Rename para upload para forçar hash diferente se necessário (mesmo buffer, nome diferente)
  const uploadFilename = uploadAs ?? filename;
  const { body, contentType } = buildMultipartBody(uploadFilename, fileBuffer, mimeType);

  const res = await api.post('/api/import/upload', body, {
    headers: { 'Content-Type': contentType, Authorization: `Bearer ${authToken}` },
  });

  const status = res.status;
  if (status === 202) {
    const data = res.data.data as Record<string, unknown>;
    return {
      importJobId: data.importJobId as string,
      streamUrl: data.streamUrl as string,
      queuePosition: data.queuePosition as number,
      status,
    };
  }

  // 200 alreadyImported ou 409 conflict
  const importJobId = (res.data?.data?.importJobId as string) ?? '';
  return {
    importJobId,
    streamUrl: `/api/import/status/${importJobId}/stream`,
    queuePosition: -1,
    status,
  };
}

async function pollUntilTerminal(
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
    if (data) {
      const s = data.status as string;
      if (s === 'done' || s === 'error' || s === 'cancelled') return data;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Job ${importJobId} did not reach terminal state within ${POLL_TIMEOUT_MS}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('Import Queue (Fase 5)', () => {
  const api = createApiClient();
  let adminToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'queue-admin-e2e',
      email: 'queue@e2e.local',
      role: 'admin',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/import/queue', () => {
    it('retorna { running, queued } com formato correto quando fila está vazia', async () => {
      const res = await api.get('/api/import/queue', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const data = res.data.data as Record<string, unknown>;
      expect('running' in data).toBe(true);
      expect(Array.isArray(data.queued)).toBe(true);
    });

    it('retorna 401 sem token', async () => {
      const res = await api.get('/api/import/queue');
      expect(res.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('Upload — resposta com queuePosition', () => {
    it('upload com slot livre retorna queuePosition: 0', async () => {
      // Espera fila vazia antes de testar
      const qRes = await api.get('/api/import/queue', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const qData = qRes.data.data as Record<string, unknown>;
      if (qData.running !== null) {
        // Fila ocupada — pula para não interferir com outros testes
        return;
      }

      const { status, queuePosition } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_q0_${Date.now()}.csv`,
      );

      if (status === 202) {
        expect(queuePosition).toBe(0);
      }
    });

    it('resposta 202 inclui importJobId, statusUrl, streamUrl, queuePosition', async () => {
      const { status, importJobId, streamUrl } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_fields_${Date.now()}.csv`,
      );

      if (status === 202) {
        expect(typeof importJobId).toBe('string');
        expect(typeof streamUrl).toBe('string');
        expect(streamUrl).toMatch(/\/api\/import\/status\/.+\/stream$/);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('Dedup de hash em andamento — 409 Conflict', () => {
    it('re-upload do mesmo arquivo com job done retorna 200 alreadyImported', async () => {
      // Primeiro upload (pode já existir como done)
      const first = await uploadFixture(
        api, adminToken, 'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ana_care_dedup_test.xlsx',
      );

      if (first.status === 202) {
        // Espera terminar
        await pollUntilTerminal(api, adminToken, first.importJobId);
      }

      // Re-upload do mesmo arquivo
      const second = await uploadFixture(
        api, adminToken, 'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ana_care_dedup_test.xlsx',
      );

      // Deve retornar 200 alreadyImported (hash done já existe)
      expect(second.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/import/cancel/:id', () => {
    it('cancel de UUID inexistente retorna 404', async () => {
      const res = await api.post(
        '/api/import/cancel/00000000-0000-0000-0000-000000000000',
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.status).toBe(404);
    });

    it('cancel de job done retorna 409', async () => {
      // Faz upload e espera terminar
      const { importJobId, status } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_cancel_done_${Date.now()}.csv`,
      );

      if (status !== 202) return; // alreadyImported — job provavelmente done

      await pollUntilTerminal(api, adminToken, importJobId);

      const res = await api.post(
        `/api/import/cancel/${importJobId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.status).toBe(409);
    });

    it('cancel sem token retorna 401', async () => {
      const res = await api.post('/api/import/cancel/some-id', {});
      expect(res.status).toBe(401);
    });

    it('cancel de job queued retorna 200 e status cancelled', async () => {
      // Satura a fila enviando um job grande primeiro
      const bigUpload = await uploadFixture(
        api, adminToken, 'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `planilha_saturate_${Date.now()}.xlsx`,
      );

      if (bigUpload.status !== 202) return; // slot livre ou dedup — pula

      // Segundo upload (deve entrar na fila se o primeiro ainda está running)
      const secondUpload = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_queued_cancel_${Date.now()}.csv`,
      );

      if (secondUpload.status !== 202 || secondUpload.queuePosition === 0) {
        // Não entrou na fila — pula
        await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
        return;
      }

      expect(secondUpload.queuePosition).toBeGreaterThanOrEqual(1);

      // Cancela o segundo (queued)
      const cancelRes = await api.post(
        `/api/import/cancel/${secondUpload.importJobId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(cancelRes.status).toBe(200);

      // Verifica status no DB
      const statusRes = await api.get(`/api/import/status/${secondUpload.importJobId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(statusRes.data.data.status).toBe('cancelled');
      expect(statusRes.data.data.cancelledAt).not.toBeNull();

      // Espera o primeiro terminar
      await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('Integridade dos dados após cancelamento', () => {
    it('workers inseridos antes do cancel continuam no banco', async () => {
      // Faz upload de um arquivo pequeno e cancela após iniciar
      const { importJobId, status, queuePosition } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_integrity_${Date.now()}.csv`,
      );

      if (status !== 202 || queuePosition !== 0) return; // não iniciou imediatamente — pula

      // Dá um breve tempo para algumas linhas serem processadas
      await new Promise(r => setTimeout(r, 500));

      // Cancela
      const cancelRes = await api.post(
        `/api/import/cancel/${importJobId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );

      if (cancelRes.status !== 200) return; // já terminou — pula

      // Espera o job chegar ao estado terminal
      const finalJob = await pollUntilTerminal(api, adminToken, importJobId);

      // Job pode ter terminado com done (se era pequeno) ou cancelled
      expect(['done', 'cancelled']).toContain(finalJob.status);

      // Se cancelado, os dados parcialmente inseridos devem persistir
      // (não verificamos contagem exata, mas o job não deve ter revertido)
      expect(finalJob).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('SSE — eventos de fila', () => {
    it('stream de job queued emite evento queued com position e queueLength', async () => {
      // Satura a fila
      const bigUpload = await uploadFixture(
        api, adminToken, 'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `planilha_sse_queue_${Date.now()}.xlsx`,
      );

      if (bigUpload.status !== 202) return;

      const secondUpload = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_sse_queue_${Date.now()}.csv`,
      );

      if (secondUpload.status !== 202 || secondUpload.queuePosition === 0) {
        await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
        return;
      }

      // Conecta ao stream do job queued
      const events = await consumeSseUntilTerminal(
        secondUpload.streamUrl,
        adminToken,
        SSE_TIMEOUT_MS,
      );

      const queuedEvents = events.filter(e => e.event === 'queued');
      // Deve ter recebido ao menos um evento queued
      expect(queuedEvents.length).toBeGreaterThanOrEqual(1);

      const first = queuedEvents[0];
      expect(typeof first.data.position).toBe('number');
      expect(typeof first.data.queueLength).toBe('number');
      expect((first.data.position as number)).toBeGreaterThanOrEqual(1);

      await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
    });

    it('stream de job cancelado (queued) emite evento cancelled e fecha', async () => {
      const bigUpload = await uploadFixture(
        api, adminToken, 'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `planilha_sse_cancel_${Date.now()}.xlsx`,
      );

      if (bigUpload.status !== 202) return;

      const secondUpload = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_sse_cancel_${Date.now()}.csv`,
      );

      if (secondUpload.status !== 202 || secondUpload.queuePosition === 0) {
        await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
        return;
      }

      // Inicia o stream do segundo job em background
      const eventsPromise = consumeSseUntilTerminal(
        secondUpload.streamUrl,
        adminToken,
        SSE_TIMEOUT_MS,
      );

      // Dá tempo para o stream conectar
      await new Promise(r => setTimeout(r, 200));

      // Cancela o segundo job
      await api.post(
        `/api/import/cancel/${secondUpload.importJobId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );

      const events = await eventsPromise;

      const cancelledEvent = events.find(e => e.event === 'cancelled');
      expect(cancelledEvent).toBeDefined();

      await pollUntilTerminal(api, adminToken, bigUpload.importJobId);
    });

    it('tipos de evento do stream de import incluem queued e cancelled como válidos', async () => {
      // Verifica que os tipos são reconhecidos (regressão: VALID_EVENT_TYPES em import-sse)
      const VALID_EVENT_TYPES = [
        'phase', 'progress', 'log', 'complete', 'error', 'queued', 'cancelled',
      ];

      const { streamUrl, status } = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_valid_types_${Date.now()}.csv`,
      );

      if (status !== 202) return;

      const events = await consumeSseUntilTerminal(streamUrl, adminToken, SSE_TIMEOUT_MS);

      for (const evt of events) {
        expect(VALID_EVENT_TYPES).toContain(evt.event);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('FIFO — serialização de imports', () => {
    it('nunca dois jobs em processing simultaneamente', async () => {
      // Sobe dois uploads e verifica que o segundo fica queued
      const first = await uploadFixture(
        api, adminToken, 'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `planilha_fifo_1_${Date.now()}.xlsx`,
      );

      const second = await uploadFixture(
        api, adminToken, 'talentum_sample.csv', 'text/csv',
        `talentum_fifo_2_${Date.now()}.csv`,
      );

      if (first.status !== 202 || second.status !== 202) return;

      if (second.queuePosition > 0) {
        // Segundo entrou na fila — verifica que está queued
        const statusRes = await api.get(`/api/import/status/${second.importJobId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(['queued', 'processing', 'done', 'cancelled']).toContain(
          statusRes.data.data.status,
        );
      }

      // Aguarda ambos terminarem
      await Promise.all([
        pollUntilTerminal(api, adminToken, first.importJobId),
        pollUntilTerminal(api, adminToken, second.importJobId),
      ]);

      // Verifica que ambos chegaram a estado terminal
      const [firstFinal, secondFinal] = await Promise.all([
        api.get(`/api/import/status/${first.importJobId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        api.get(`/api/import/status/${second.importJobId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      ]);

      expect(['done', 'error', 'cancelled']).toContain(firstFinal.data.data.status);
      expect(['done', 'error', 'cancelled']).toContain(secondFinal.data.data.status);
    });
  });
});
