/**
 * ImportController
 * POST /api/import/upload       — upload do Excel → processa assíncrono
 * GET  /api/import/status/:id   — progresso do job
 * GET  /api/import/history      — últimos N imports
 * POST /api/import/enrich       — dispara LLM enrichment
 */

import { Request, Response } from 'express';
import * as multer from 'multer';
import { PlanilhaImporter } from '../scripts/import-planilhas';
import { ImportJobRepository } from '../repositories/OperationalRepositories';
import { LLMEnrichmentService } from '../services/LLMEnrichmentService';
import { hashFile } from '../scripts/import-utils';

export const uploadMiddleware = multer.default({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB
    fieldSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xlsx e .xls são aceitos'));
    }
  },
}).single('file');

export class ImportController {
  private importer = new PlanilhaImporter();
  private importJobRepo = new ImportJobRepository();

  async uploadAndProcess(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        console.warn('[ImportController.uploadAndProcess] no file received');
        res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        return;
      }

      const buffer = req.file.buffer;
      const filename = req.file.originalname;
      const fileHash = hashFile(buffer);
      const createdBy = (req as any).user?.uid ?? 'admin';

      console.log(`[ImportController.uploadAndProcess] file: "${filename}" | size: ${(buffer.length / 1024).toFixed(1)}KB | hash: ${fileHash.slice(0, 12)}... | createdBy: ${createdBy}`);

      // Impede reprocessar o mesmo arquivo exato
      const existing = await this.importJobRepo.findByFileHash(fileHash);
      if (existing) {
        console.log(`[ImportController.uploadAndProcess] file already imported as job ${existing.id} at ${existing.finishedAt}`);
        res.status(200).json({
          success: true,
          alreadyImported: true,
          message: 'Arquivo já importado. Envie force=true no body para reimportar.',
          data: { importJobId: existing.id, importedAt: existing.finishedAt },
        });
        return;
      }

      const importJob = await this.importJobRepo.create({ filename, fileHash, createdBy });
      console.log(`[ImportController.uploadAndProcess] import job created: ${importJob.id} | starting async processing...`);

      // Processa em background — não bloqueia o response
      this.runImportAsync(buffer, filename, importJob.id).catch(err => {
        console.error(`[Import ${importJob.id}] ASYNC ERROR:`, err.message, err.stack);
      });

      res.status(202).json({
        success: true,
        data: {
          importJobId: importJob.id,
          filename,
          message: 'Upload recebido. Processamento iniciado.',
          statusUrl: `/api/import/status/${importJob.id}`,
        },
      });
    } catch (err) {
      console.error('[ImportController.uploadAndProcess] ERROR:', err);
      res.status(500).json({ success: false, error: 'Erro interno no upload' });
    }
  }

  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const job = await this.importJobRepo.findById(req.params.id);
      if (!job) {
        res.status(404).json({ success: false, error: 'Import job não encontrado' });
        return;
      }

      const progressPercent = job.totalRows > 0
        ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

      res.status(200).json({
        success: true,
        data: {
          id: job.id,
          filename: job.filename,
          status: job.status,
          progress: {
            percent: progressPercent,
            totalRows: job.totalRows,
            processedRows: job.processedRows,
            errorRows: job.errorRows,
            skippedRows: job.skippedRows,
          },
          results: {
            workersCreated: job.workersCreated,
            workersUpdated: job.workersUpdated,
            casesCreated: job.casesCreated,
            casesUpdated: job.casesUpdated,
            encuadresCreated: job.encuadresCreated,
            encuadresSkipped: job.encuadresSkipped,
          },
          errors: job.errorDetails?.slice(0, 50) ?? [],
          totalErrors: job.errorDetails?.length ?? 0,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          duration: job.startedAt && job.finishedAt
            ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
            : null,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 100);
      const jobs = await this.importJobRepo.listRecent(limit);

      res.status(200).json({
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          filename: job.filename,
          status: job.status,
          workersCreated: job.workersCreated,
          encuadresCreated: job.encuadresCreated,
          encuadresSkipped: job.encuadresSkipped,
          errorRows: job.errorRows,
          createdBy: job.createdBy,
          createdAt: job.createdAt,
          finishedAt: job.finishedAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  async triggerEnrichment(req: Request, res: Response): Promise<void> {
    try {
      const batchSize = Math.min(parseInt(String(req.body.batchSize ?? '50')), 200);
      this.runEnrichmentAsync(batchSize).catch(err => {
        console.error('[Enrichment] Erro:', err.message);
      });
      res.status(202).json({
        success: true,
        message: 'Enriquecimento LLM iniciado em background.',
        data: { batchSize },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  private async runImportAsync(buffer: Buffer, filename: string, importJobId: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[Import ${importJobId}] ASYNC PROCESSING START | file: "${filename}"`);

    await this.importer.importBuffer(buffer, filename, importJobId, (progress) => {
      this.importJobRepo.updateProgress(importJobId, {
        totalRows: progress.totalRows,
        processedRows: progress.processedRows,
        errorRows: progress.errors.length,
        encuadresCreated: progress.encuadresCreated,
        encuadresSkipped: progress.encuadresSkipped,
        workersCreated: progress.workersCreated,
        workersUpdated: progress.workersUpdated,
        casesCreated: progress.casesCreated,
        casesUpdated: progress.casesUpdated,
      }).catch(() => {});
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Import ${importJobId}] ${progress.sheet}: ${progress.processedRows}/${progress.totalRows} (${elapsed}s) | workers:+${progress.workersCreated} ~${progress.workersUpdated} | enc:+${progress.encuadresCreated} skip:${progress.encuadresSkipped} | errs:${progress.errors.length}`);
    });

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Import ${importJobId}] ASYNC PROCESSING COMPLETE in ${totalElapsed}s`);
  }

  private async runEnrichmentAsync(batchSize: number): Promise<void> {
    const service = new LLMEnrichmentService();
    const result = await service.enrichPending(batchSize);
    console.log(`[Enrichment] ${result.processed} processados, ${result.errors} erros`);
  }
}
