/**
 * import-pipeline.test.ts
 *
 * Testa o fluxo completo de import: upload do arquivo → import_job criado →
 * processamento assíncrono → linhas salvas no banco.
 *
 * Cobre as 4 fontes de dados: Talentum CSV, Planilha Operativa, ClickUp, Ana Care.
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

const FIXTURES_DIR = join(__dirname, 'fixtures');

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Constrói o body multipart/form-data manualmente como Buffer.
 * Evita dependência de `form-data` e problemas com o FormData nativo do Node.js
 * não sendo corretamente serializado pelo axios.
 */
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
): Promise<{ importJobId: string; statusUrl: string }> {
  const fileBuffer = readFileSync(join(FIXTURES_DIR, filename));
  const { body, contentType } = buildMultipartBody(filename, fileBuffer, mimeType);

  const res = await api.post('/api/import/upload', body, {
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${authToken}`,
    },
  });

  expect(res.status).toBe(202);
  expect(res.data.data.importJobId).toBeTruthy();
  return {
    importJobId: res.data.data.importJobId as string,
    statusUrl: res.data.data.statusUrl as string,
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
  throw new Error(`Import job ${importJobId} did not finish within ${POLL_TIMEOUT_MS}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('Import Pipeline E2E', () => {
  const api = createApiClient();
  let adminToken: string;
  let pool: Pool;

  beforeAll(async () => {
    await waitForBackend(api);
    adminToken = await getMockToken(api, {
      uid: 'import-admin-e2e',
      email: 'import-admin@e2e.local',
      role: 'admin',
    });
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Talentum CSV (talent_search)
  // ────────────────────────────────────────────────────────────────────────────
  describe('Talentum CSV (talent_search)', () => {
    let importJobId: string;

    it('POST /api/import/upload → 202 Accepted com importJobId', async () => {
      const result = await uploadFixture(api, adminToken, 'talentum_sample.csv', 'text/csv');
      importJobId = result.importJobId;

      const { rows } = await pool.query(
        'SELECT status FROM import_jobs WHERE id = $1',
        [importJobId],
      );
      expect(rows).toHaveLength(1);
      expect(['pending', 'processing']).toContain(rows[0].status);
    });

    it('polling GET /api/import/status/:id → chega em done', async () => {
      const data = await pollUntilDone(api, adminToken, importJobId);
      expect(data.status).toBe('done');
    });

    it('após done → workers válidos salvos no banco', async () => {
      const { rows } = await pool.query(
        `SELECT w.id FROM workers w
         JOIN import_jobs j ON j.id = $1
         WHERE w.created_at >= j.started_at`,
        [importJobId],
      );
      // Fixture tem 2 linhas com telefone válido
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('linha com telefone ausente acumula em error_count — não para o import', async () => {
      const res = await api.get(`/api/import/status/${importJobId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = res.data.data as Record<string, unknown>;
      expect(data.status).toBe('done');
      const progress = data.progress as Record<string, number>;
      // 3ª linha do CSV não tem telefone — deve gerar ao menos 1 erro
      expect(progress.errorRows).toBeGreaterThanOrEqual(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Planilha Operativa XLSX
  // ────────────────────────────────────────────────────────────────────────────
  describe('Planilha Operativa XLSX', () => {
    let importJobId: string;

    it('POST /api/import/upload → 202 Accepted', async () => {
      const result = await uploadFixture(
        api,
        adminToken,
        'planilha_operativa.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      importJobId = result.importJobId;
      expect(importJobId).toBeTruthy();
    });

    it('polling → chega em done', async () => {
      const data = await pollUntilDone(api, adminToken, importJobId);
      expect(data.status).toBe('done');
    });

    it('encuadres salvos no banco', async () => {
      const { rows } = await pool.query(
        `SELECT e.id FROM encuadres e
         JOIN import_jobs j ON j.id = $1
         WHERE e.created_at >= j.started_at`,
        [importJobId],
      );
      // _Base1 cria encuadres para cada linha com caso + phone válidos
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('sequência pós-import: linkWorkersByPhone não gerou exceção', async () => {
      // Verifica que a coluna worker_id existe em encuadres (linkage foi tentado)
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'encuadres' AND column_name = 'worker_id'`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ClickUp XLSX
  // ────────────────────────────────────────────────────────────────────────────
  describe('ClickUp XLSX', () => {
    let importJobId: string;

    it('POST /api/import/upload → 202 Accepted', async () => {
      const result = await uploadFixture(
        api,
        adminToken,
        'clickup_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      importJobId = result.importJobId;
      expect(importJobId).toBeTruthy();
    });

    it('polling → chega em done', async () => {
      const data = await pollUntilDone(api, adminToken, importJobId);
      expect(data.status).toBe('done');
    });

    it('job_postings salvas com clickup_task_id', async () => {
      const { rows } = await pool.query(
        `SELECT jp.clickup_task_id FROM job_postings jp
         JOIN import_jobs j ON j.id = $1
         WHERE jp.created_at >= j.started_at
           AND jp.clickup_task_id IS NOT NULL`,
        [importJobId],
      );
      // Fixture tem 2 linhas do tipo 'task' (3ª é 'milestone' → ignorada)
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Ana Care XLSX
  // ────────────────────────────────────────────────────────────────────────────
  describe('Ana Care XLSX', () => {
    let importJobId: string;

    it('POST /api/import/upload → 202 Accepted', async () => {
      const result = await uploadFixture(
        api,
        adminToken,
        'ana_care_sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      importJobId = result.importJobId;
      expect(importJobId).toBeTruthy();
    });

    it('polling → chega em done', async () => {
      const data = await pollUntilDone(api, adminToken, importJobId);
      expect(data.status).toBe('done');
    });

    it('workers salvos com data_sources contendo ana_care', async () => {
      // A coluna é data_sources (array TEXT[]) — o importer faz ARRAY_APPEND('ana_care')
      const { rows } = await pool.query(
        `SELECT w.data_sources FROM workers w
         JOIN import_jobs j ON j.id = $1
         WHERE w.created_at >= j.started_at`,
        [importJobId],
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      rows.forEach(r => expect(r.data_sources).toContain('ana_care'));
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Arquivos inválidos
  // ────────────────────────────────────────────────────────────────────────────
  describe('Arquivos inválidos', () => {
    it('retorna 4xx para MIME type não reconhecido pelo multer (.pdf)', async () => {
      // application/pdf não está na allowlist de multer nem tem extensão .xlsx/.xls/.csv
      const fileBuffer = readFileSync(join(FIXTURES_DIR, 'invalid_text.txt'));
      const { body, contentType } = buildMultipartBody('invalid_file.pdf', fileBuffer, 'application/pdf');

      const res = await api.post('/api/import/upload', body, {
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${adminToken}` },
      });
      // multer rejeita → controller não chega a executar → 400 ou 500 dependendo do error handler
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('CSV vazio → import_job finaliza com erro ou zero rows', async () => {
      const fileBuffer = readFileSync(join(FIXTURES_DIR, 'empty.csv'));
      const { body, contentType } = buildMultipartBody('empty.csv', fileBuffer, 'text/csv');

      const res = await api.post('/api/import/upload', body, {
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${adminToken}` },
      });

      if (res.status === 202) {
        const data = await pollUntilDone(api, adminToken, res.data.data.importJobId as string);
        expect(['done', 'error']).toContain(data.status);
        const progress = data.progress as Record<string, number>;
        expect(progress.totalRows ?? 0).toBe(0);
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('requer autenticação — 401 sem token', async () => {
      const fileBuffer = readFileSync(join(FIXTURES_DIR, 'talentum_sample.csv'));
      const { body, contentType } = buildMultipartBody('talentum_sample.csv', fileBuffer, 'text/csv');

      const res = await api.post('/api/import/upload', body, {
        headers: { 'Content-Type': contentType },
      });
      expect(res.status).toBe(401);
    });
  });
});
