/**
 * ImportController.test.ts
 *
 * Garante que o fluxo HTTP de upload funciona de ponta a ponta:
 * multer fileFilter → controller → resposta.
 *
 * Cenários:
 *   IC1 — CSV com Content-Type text/csv → aceito (202)          ← bug corrigido
 *   IC2 — CSV com mimetype genérico + extensão .csv → aceito (202)
 *   IC3 — XLSX → aceito (202)
 *   IC4 — PDF → fileFilter rejeita, não chega ao controller
 *   IC5 — Nenhum arquivo → 400
 *   IC6 — Mesmo arquivo duas vezes → 200 com alreadyImported: true
 *   IC7 — Resposta 202 tem importJobId e statusUrl corretos
 *   IC8 — importBuffer chamado em background após upload aceito
 */

// ─── Mocks ANTES de qualquer import ─────────────────────────────────────────

jest.mock('../../repositories/OperationalRepositories');
jest.mock('../../scripts/import-planilhas');
jest.mock('../ImportQueue', () => ({
  importQueue: {
    enqueue: jest.fn().mockResolvedValue(0),
    cancel: jest.fn().mockResolvedValue('not_found'),
    getState: jest.fn().mockReturnValue({ running: null, queued: [] }),
    getQueuePosition: jest.fn().mockReturnValue(null),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { ImportController, uploadMiddleware } from '../ImportController';
import { ImportJobRepository } from '../../repositories/OperationalRepositories';
import { PlanilhaImporter } from '../../scripts/import-planilhas';
import { importQueue } from '../ImportQueue';

// ─── Helpers para construir buffers de teste ─────────────────────────────────

function buildCSVBuffer(): Buffer {
  const headers = [
    'Nombre', 'Apellido', 'Secuencias', 'Busquedas', 'Pre screenings',
    'Fecha', 'Status', 'Notas', 'Rating', 'Emails', 'Numeros de telefono',
    'Linkedin',
    '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
    '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
  ];
  const row = [
    'Marisol', 'Pallero', '', '', 'CASO 694, CASO 672',
    '3/18/2026', 'QUALIFIED', '', 'No rating',
    'marisol@gmail.com', '5491128699277', '', '27280435215', 'Acompañante',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, row]);
  return Buffer.from(XLSX.utils.sheet_to_csv(ws), 'utf-8');
}

function buildXLSXBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['col1', 'col2'], ['a', 'b']]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── App de teste (replica o setup de produção) ──────────────────────────────

function buildTestApp(): express.Express {
  const app = express();
  const controller = new ImportController();

  app.post(
    '/api/import/upload',
    uploadMiddleware,
    (req: Request, res: Response) => controller.uploadAndProcess(req, res),
  );

  // Captura erros do multer (fileFilter rejeita o tipo) e devolve 400
  // Em produção não há esse handler, mas o teste precisa de uma resposta
  // determinística para validar que o arquivo NÃO chegou ao controller.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ success: false, error: err.message ?? 'Arquivo inválido' });
  });

  return app;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const FAKE_JOB = {
  id: 'job-test-001',
  filename: 'export.csv',
  status: 'pending',
  finishedAt: null,
};

let mockImportJobRepo: jest.Mocked<any>;
let mockImporter: jest.Mocked<any>;

beforeEach(() => {
  jest.clearAllMocks();

  mockImportJobRepo = {
    findByFileHash: jest.fn().mockResolvedValue(null),
    findActiveByFileHash: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(FAKE_JOB),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  (ImportJobRepository as jest.Mock).mockImplementation(() => mockImportJobRepo);

  mockImporter = {
    importBuffer: jest.fn().mockResolvedValue([{
      sheet: 'TalentSearch',
      totalRows: 1,
      processedRows: 1,
      errors: [],
      workersCreated: 1,
      workersUpdated: 0,
      casesCreated: 0,
      casesUpdated: 0,
      encuadresCreated: 0,
      encuadresSkipped: 0,
    }]),
  };
  (PlanilhaImporter as jest.Mock).mockImplementation(() => mockImporter);
});

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('ImportController — fileFilter + fluxo de upload', () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildTestApp();
  });

  it('IC1 — CSV com Content-Type text/csv → aceito pelo multer e retorna 202', async () => {
    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', buildCSVBuffer(), { filename: 'export_2026-03-20.csv', contentType: 'text/csv' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    // Arquivo chegou ao controller: job foi criado
    expect(mockImportJobRepo.create).toHaveBeenCalledTimes(1);
  });

  it('IC2 — CSV com mimetype genérico (application/octet-stream) + extensão .csv → aceito', async () => {
    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', buildCSVBuffer(), { filename: 'export.csv', contentType: 'application/octet-stream' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockImportJobRepo.create).toHaveBeenCalledTimes(1);
  });

  it('IC3 — XLSX → aceito pelo multer e retorna 202', async () => {
    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', buildXLSXBuffer(), {
        filename: 'planilha.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockImportJobRepo.create).toHaveBeenCalledTimes(1);
  });

  it('IC4 — PDF → fileFilter rejeita: não cria job, não chama importer', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake content');
    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', pdfBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(mockImportJobRepo.create).not.toHaveBeenCalled();
    expect(mockImporter.importBuffer).not.toHaveBeenCalled();
  });

  it('IC5 — Nenhum arquivo enviado → 400 com mensagem clara', async () => {
    const res = await request(app)
      .post('/api/import/upload')
      .field('type', 'talent_search');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/nenhum arquivo/i);
    expect(mockImportJobRepo.create).not.toHaveBeenCalled();
  });

  it('IC6 — Mesmo arquivo enviado duas vezes → 200 com alreadyImported: true', async () => {
    mockImportJobRepo.findByFileHash.mockResolvedValue({
      id: 'job-existing-001',
      finishedAt: new Date('2026-03-19T10:00:00Z'),
    });

    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', buildCSVBuffer(), { filename: 'export.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyImported).toBe(true);
    expect(res.body.data.importJobId).toBe('job-existing-001');
    // Não cria job novo nem reprocessa
    expect(mockImportJobRepo.create).not.toHaveBeenCalled();
    expect(mockImporter.importBuffer).not.toHaveBeenCalled();
  });

  it('IC7 — Resposta 202 contém importJobId e statusUrl corretos', async () => {
    const res = await request(app)
      .post('/api/import/upload')
      .attach('file', buildCSVBuffer(), { filename: 'export_2026-03-20.csv', contentType: 'text/csv' });

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({
      importJobId: 'job-test-001',
      filename:    'export_2026-03-20.csv',
      statusUrl:   '/api/import/status/job-test-001',
    });
  });

  it('IC8 — importQueue.enqueue chamado com jobId, buffer e filename corretos', async () => {
    await request(app)
      .post('/api/import/upload')
      .attach('file', buildCSVBuffer(), { filename: 'export.csv', contentType: 'text/csv' });

    expect(importQueue.enqueue).toHaveBeenCalledWith(
      'job-test-001',
      expect.any(Buffer),
      'export.csv',
    );
  });
});
