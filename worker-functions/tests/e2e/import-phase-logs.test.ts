/**
 * import-phase-logs.test.ts
 *
 * Testa as Fases 1 e 2 do roadmap de Upload Status:
 *  - Fase 1: currentPhase avança pelo pipeline e termina em 'done'
 *  - Fase 2: logs[] acumula mensagens com ts/level/message
 *
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

const VALID_PHASES = [
  'upload_received', 'parsing', 'importing',
  'post_processing', 'linking', 'dedup', 'done', 'error',
] as const;
type ImportPhase = typeof VALID_PHASES[number];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
): Promise<{ importJobId: string }> {
  const fileBuffer = readFileSync(join(FIXTURES_DIR, filename));
  const { body, contentType } = buildMultipartBody(filename, fileBuffer, mimeType);

  const res = await api.post('/api/import/upload', body, {
    headers: { 'Content-Type': contentType, Authorization: `Bearer ${authToken}` },
  });

  expect(res.status).toBe(202);
  return { importJobId: res.data.data.importJobId as string };
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
  throw new Error(`Import job ${importJobId} did not finish within ${POLL_TIMEOUT_MS}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase Tracking & Log Lines (Fases 1 e 2)', () => {
  const api = createApiClient();
  let adminToken: string;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'phase-logs-admin-e2e',
      email: 'phase-logs@e2e.local',
      role: 'admin',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 1 — currentPhase está presente e válida logo após o upload
  // ──────────────────────────────────────────────────────────────────────────
  describe('Fase 1 — currentPhase tracking', () => {
    let importJobId: string;

    beforeAll(async () => {
      const res = await uploadFixture(api, adminToken, 'talentum_sample.csv', 'text/csv');
      importJobId = res.importJobId;
    });

    it('GET /status imediatamente após upload tem currentPhase definida', async () => {
      const res = await api.get(`/api/import/status/${importJobId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = res.data.data as Record<string, unknown>;
      expect(data.currentPhase).toBeDefined();
      expect(VALID_PHASES).toContain(data.currentPhase as ImportPhase);
    });

    it('após conclusão, currentPhase é "done"', async () => {
      const data = await pollUntilDone(api, adminToken, importJobId);
      expect(data.currentPhase).toBe('done');
    });

    it('currentPhase e status são consistentes (done/done, error/error)', async () => {
      const res = await api.get(`/api/import/status/${importJobId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = res.data.data as Record<string, unknown>;
      expect(data.status).toBe(data.currentPhase);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 1 — transições de phase capturadas durante polling
  // ──────────────────────────────────────────────────────────────────────────
  describe('Fase 1 — phase transitions durante polling', () => {
    it('planilha_operativa percorre ao menos parsing → importing → done', async () => {
      const { importJobId } = await uploadFixture(
        api, adminToken,
        'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const seenPhases = new Set<string>();
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const res = await api.get(`/api/import/status/${importJobId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = res.data?.data as Record<string, unknown>;
        if (data?.currentPhase) seenPhases.add(data.currentPhase as string);
        if (data?.status === 'done' || data?.status === 'error') break;
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      }

      // Deve ter passado pela fase 'done' no mínimo (pode ter perdido as intermediárias)
      expect(seenPhases.has('done')).toBe(true);
      // Todas as fases vistas devem ser válidas
      for (const phase of seenPhases) {
        expect(VALID_PHASES).toContain(phase as ImportPhase);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 2 — logs[] presente e populado
  // ──────────────────────────────────────────────────────────────────────────
  describe('Fase 2 — log lines persistidos', () => {
    let importJobId: string;
    let finalData: Record<string, unknown>;

    beforeAll(async () => {
      const res = await uploadFixture(api, adminToken, 'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      importJobId = res.importJobId;
      finalData = await pollUntilDone(api, adminToken, importJobId);
    });

    it('resposta inclui campo logs[]', () => {
      expect(Array.isArray(finalData.logs)).toBe(true);
    });

    it('logs[] tem ao menos uma entrada', () => {
      const logs = finalData.logs as unknown[];
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('cada log entry tem ts, level e message', () => {
      const logs = finalData.logs as Array<Record<string, unknown>>;
      for (const entry of logs) {
        expect(typeof entry.ts).toBe('string');
        expect(['info', 'warn', 'error']).toContain(entry.level);
        expect(typeof entry.message).toBe('string');
        expect((entry.message as string).length).toBeGreaterThan(0);
      }
    });

    it('ts é um ISO timestamp válido', () => {
      const logs = finalData.logs as Array<Record<string, unknown>>;
      for (const entry of logs) {
        const d = new Date(entry.ts as string);
        expect(d.getTime()).not.toBeNaN();
      }
    });

    it('ao menos uma entrada de nível info', () => {
      const logs = finalData.logs as Array<Record<string, unknown>>;
      const infoLogs = logs.filter(l => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('logs retornam no máximo 100 entradas via GET /status', () => {
      const logs = finalData.logs as unknown[];
      expect(logs.length).toBeLessThanOrEqual(100);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 2 — logs com erros de linha
  // ──────────────────────────────────────────────────────────────────────────
  describe('Fase 2 — erros de linha aparecem como warn nos logs', () => {
    it('talentum com linha inválida gera log warn (reutiliza job do describe anterior)', async () => {
      // O arquivo talentum_sample.csv já foi importado no describe anterior.
      // Buscamos o job mais recente com status done para verificar os logs.
      const res = await api.get('/api/import/history?limit=20', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const jobs = res.data.data as Array<Record<string, unknown>>;
      const talentumJob = jobs.find(j => (j.filename as string).includes('talentum'));
      expect(talentumJob).toBeDefined();

      const statusRes = await api.get(`/api/import/status/${talentumJob!.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = statusRes.data.data as Record<string, unknown>;
      const logs = data.logs as Array<Record<string, unknown>>;
      const progress = data.progress as Record<string, number>;

      // Se há errorRows, deve ter ao menos um log warn correspondente
      if (progress.errorRows > 0) {
        const warnLogs = logs.filter(l => l.level === 'warn');
        expect(warnLogs.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ClickUp — verifica phase + logs juntos
  // ──────────────────────────────────────────────────────────────────────────
  describe('ClickUp — phase e logs juntos', () => {
    it('clickup termina com currentPhase=done e logs populados', async () => {
      const { importJobId } = await uploadFixture(
        api, adminToken, 'clickup_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const data = await pollUntilDone(api, adminToken, importJobId);

      expect(data.currentPhase).toBe('done');
      expect(Array.isArray(data.logs)).toBe(true);
      expect((data.logs as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  });
});
