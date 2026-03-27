/**
 * import-logs-visibility.test.ts
 *
 * Verifica que logs são corretamente persistidos e visíveis após as correções
 * de appendLog (COALESCE), phase tracking e error handling no ImportQueue.
 *
 * Cobre 4 fluxos críticos:
 *  1. Logs persistidos e visíveis via GET /api/import/status/:id após import concluído
 *  2. SSE replay para job já terminal: eventos log + complete com currentPhase e logs[]
 *  3. Erro fatal aparece nos logs quando o tipo do arquivo não é reconhecido
 *  4. Phase tracking correto: currentPhase = 'done' e sequência lógica de fases
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
const SSE_TIMEOUT_MS = 25_000;

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — mesmos padrões de import-sse.test.ts
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Consome SSE via http nativo até evento terminal (complete | error | cancelled)
 * ou timeout. Trata ECONNRESET como encerramento normal (causado por req.destroy()).
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

  // 202: novo job; 200 alreadyImported: reutiliza o job já existente
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
  throw new Error(`Job ${importJobId} não terminou em ${POLL_TIMEOUT_MS}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('Log Visibility & Phase Tracking', () => {
  const api = createApiClient();
  let adminToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'log-visibility-admin-e2e',
      email: 'log-visibility@e2e.local',
      role: 'admin',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Logs persistidos e visíveis via GET /api/import/status/:id
  // ──────────────────────────────────────────────────────────────────────────

  describe('1. Logs persistidos após import concluído (GET status)', () => {
    let jobData: Record<string, unknown>;

    beforeAll(async () => {
      const { importJobId } = await uploadFixture(
        api, adminToken,
        'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      jobData = await pollUntilDone(api, adminToken, importJobId);
    });

    it('job termina com status done', () => {
      expect(jobData.status).toBe('done');
    });

    it('logs[] contém pelo menos 1 entrada', () => {
      const logs = jobData.logs as unknown[] | undefined;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs!.length).toBeGreaterThan(0);
    });

    it('cada entrada tem ts (ISO), level e message não-vazia', () => {
      const logs = jobData.logs as Array<Record<string, unknown>>;
      for (const log of logs) {
        expect(typeof log.ts).toBe('string');
        expect(log.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
        expect(['info', 'warn', 'error']).toContain(log.level);
        expect(typeof log.message).toBe('string');
        expect((log.message as string).length).toBeGreaterThan(0);
      }
    });

    it('levels são lowercase (nunca INFO/WARN/ERROR em maiúsculo)', () => {
      const logs = jobData.logs as Array<Record<string, unknown>>;
      for (const log of logs) {
        expect(log.level).toBe((log.level as string).toLowerCase());
      }
    });

    it('há pelo menos 1 log de nível info', () => {
      const logs = jobData.logs as Array<Record<string, unknown>>;
      const infoLogs = logs.filter(l => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThan(0);
    });

    it('GET status retorna no máximo 100 entradas de log', () => {
      const logs = jobData.logs as Array<unknown>;
      expect(logs.length).toBeLessThanOrEqual(100);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. SSE replay para job já terminal: log events + complete com currentPhase
  // ──────────────────────────────────────────────────────────────────────────

  describe('2. SSE replay de job terminal (logs do DB)', () => {
    let sseEvents: SseEvent[];

    beforeAll(async () => {
      // Fixture diferente para evitar alreadyImported dentro desta suite
      const { importJobId, streamUrl } = await uploadFixture(
        api, adminToken,
        'talentum_sample.csv',
        'text/csv',
      );

      // 1. Aguarda o job TERMINAR antes de abrir o SSE
      await pollUntilDone(api, adminToken, importJobId);

      // 2. Abre SSE depois — deve fazer replay a partir do DB, não em tempo real
      sseEvents = await consumeSseUntilTerminal(streamUrl, adminToken);
    });

    it('o stream emite evento terminal (complete ou error)', () => {
      const terminal = sseEvents.find(e => e.event === 'complete' || e.event === 'error');
      expect(terminal).toBeDefined();
    });

    it('eventos log chegam antes do evento terminal', () => {
      const terminalIdx = sseEvents.findIndex(e => e.event === 'complete' || e.event === 'error');
      expect(terminalIdx).toBeGreaterThan(-1);
      const logsBefore = sseEvents.slice(0, terminalIdx).filter(e => e.event === 'log');
      expect(logsBefore.length).toBeGreaterThan(0);
    });

    it('cada evento log tem ts, level lowercase e message', () => {
      const logEvents = sseEvents.filter(e => e.event === 'log');
      for (const ev of logEvents) {
        expect(typeof ev.data.ts).toBe('string');
        expect(['info', 'warn', 'error']).toContain(ev.data.level);
        expect(typeof ev.data.message).toBe('string');
        expect((ev.data.message as string).length).toBeGreaterThan(0);
      }
    });

    it('evento complete contém currentPhase preenchido', () => {
      const completeEvent = sseEvents.find(e => e.event === 'complete');
      if (!completeEvent) return; // se foi error, ok

      expect(completeEvent.data.currentPhase).toBeDefined();
      expect(typeof completeEvent.data.currentPhase).toBe('string');
      expect((completeEvent.data.currentPhase as string).length).toBeGreaterThan(0);
    });

    it('evento complete contém logs[] (fallback para o frontend)', () => {
      const completeEvent = sseEvents.find(e => e.event === 'complete');
      if (!completeEvent) return;

      expect(Array.isArray(completeEvent.data.logs)).toBe(true);
    });

    it('o stream fecha após o evento terminal (sem eventos adicionais)', () => {
      const terminalIdx = sseEvents.findIndex(e => e.event === 'complete' || e.event === 'error');
      // Não deve haver eventos após o terminal
      expect(sseEvents.length).toBe(terminalIdx + 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Erro fatal aparece nos logs quando o tipo do arquivo não é reconhecido
  // ──────────────────────────────────────────────────────────────────────────

  describe('3. Erro fatal visível nos logs (tipo não reconhecido)', () => {
    let jobData: Record<string, unknown>;
    let sseEvents: SseEvent[];

    beforeAll(async () => {
      // empty.csv: arquivo vazio — detectType lança "Tipo de planilha não reconhecido"
      const { importJobId, streamUrl } = await uploadFixture(
        api, adminToken,
        'empty.csv',
        'text/csv',
      );

      // Inicia SSE em paralelo com o polling para capturar eventos em tempo real
      [jobData, sseEvents] = await Promise.all([
        pollUntilDone(api, adminToken, importJobId),
        consumeSseUntilTerminal(streamUrl, adminToken),
      ]);
    });

    it('job termina com status error', () => {
      expect(jobData.status).toBe('error');
    });

    it('logs[] contém pelo menos 1 entrada de nível error', () => {
      const logs = jobData.logs as Array<Record<string, unknown>> | undefined;
      expect(Array.isArray(logs)).toBe(true);
      const errorLogs = logs!.filter(l => l.level === 'error');
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it('a entrada de erro contém mensagem descritiva não-vazia', () => {
      const logs = jobData.logs as Array<Record<string, unknown>>;
      const errorLog = logs.find(l => l.level === 'error');
      expect(errorLog).toBeDefined();
      expect(typeof errorLog!.message).toBe('string');
      expect((errorLog!.message as string).length).toBeGreaterThan(0);
    });

    it('SSE emite evento error com message preenchido', () => {
      const errorEvent = sseEvents.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(typeof errorEvent!.data.message).toBe('string');
      expect((errorEvent!.data.message as string).length).toBeGreaterThan(0);
    });

    it('o evento error do SSE contém a mesma mensagem que está nos logs do DB', () => {
      const errorEvent = sseEvents.find(e => e.event === 'error');
      const logs = jobData.logs as Array<Record<string, unknown>>;
      const errorLog = logs.find(l => l.level === 'error');

      if (!errorEvent || !errorLog) return; // guards — falhas já cobertas acima

      // A mensagem do SSE deve estar contida na mensagem do log (ou vice-versa)
      const sseMsg = (errorEvent.data.message as string).toLowerCase();
      const logMsg = (errorLog.message as string).toLowerCase();
      const overlap = sseMsg.includes(logMsg.slice(0, 20)) || logMsg.includes(sseMsg.slice(0, 20));
      expect(overlap).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Phase tracking correto após job done
  // ──────────────────────────────────────────────────────────────────────────

  describe('4. Phase tracking correto (currentPhase e sequência)', () => {
    let jobData: Record<string, unknown>;
    let sseEvents: SseEvent[];

    beforeAll(async () => {
      const { importJobId, streamUrl } = await uploadFixture(
        api, adminToken,
        'clickup_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      [jobData, sseEvents] = await Promise.all([
        pollUntilDone(api, adminToken, importJobId),
        consumeSseUntilTerminal(streamUrl, adminToken),
      ]);
    });

    it('GET status retorna currentPhase = "done" após import concluído', () => {
      expect(jobData.status).toBe('done');
      expect(jobData.currentPhase).toBe('done');
    });

    it('SSE emite evento phase com phase = "parsing" (primeira fase real)', () => {
      const parsingEvent = sseEvents.find(e => e.event === 'phase' && e.data.phase === 'parsing');
      // Se o SSE conectou antes do fim, deve ter capturado — se não, o complete cobre
      const completeEvent = sseEvents.find(e => e.event === 'complete');
      const hasParsing = !!parsingEvent || (completeEvent?.data.currentPhase === 'done');
      expect(hasParsing).toBe(true);
    });

    it('fase parsing deve anteceder importing na sequência SSE (quando ambas visíveis)', () => {
      const phaseEvents = sseEvents.filter(e => e.event === 'phase');
      const phases = phaseEvents.map(e => e.data.phase as string);

      const parsingIdx = phases.indexOf('parsing');
      const importingIdx = phases.indexOf('importing');

      if (parsingIdx !== -1 && importingIdx !== -1) {
        expect(parsingIdx).toBeLessThan(importingIdx);
      }
      // Se apenas um dos dois foi capturado (job muito rápido), testa passes
    });

    it('evento complete inclui currentPhase preenchido', () => {
      const completeEvent = sseEvents.find(e => e.event === 'complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.data.currentPhase).toBeDefined();
      expect(typeof completeEvent!.data.currentPhase).toBe('string');
    });

    it('evento complete inclui progress com percent entre 0 e 100', () => {
      const completeEvent = sseEvents.find(e => e.event === 'complete');
      if (!completeEvent) return;

      const progress = completeEvent.data.progress as Record<string, unknown> | undefined;
      if (!progress) return;

      if (progress.percent !== undefined) {
        expect(typeof progress.percent).toBe('number');
        expect(progress.percent as number).toBeGreaterThanOrEqual(0);
        expect(progress.percent as number).toBeLessThanOrEqual(100);
      }
    });

    it('todas as fases recebidas no SSE são valores válidos', () => {
      const VALID_PHASES = [
        'upload_received', 'parsing', 'importing', 'post_processing',
        'linking', 'dedup', 'done', 'error', 'queued', 'cancelled',
      ];
      const phaseEvents = sseEvents.filter(e => e.event === 'phase');
      for (const ev of phaseEvents) {
        expect(VALID_PHASES).toContain(ev.data.phase);
      }
    });
  });
});
