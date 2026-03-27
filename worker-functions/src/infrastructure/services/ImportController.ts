/**
 * ImportController
 * POST /api/import/upload              — upload do Excel → enfileira na ImportQueue
 * GET  /api/import/status/:id          — progresso do job (polling)
 * GET  /api/import/status/:id/stream   — progresso em tempo real via SSE (Fase 3)
 * GET  /api/import/history             — últimos N imports
 * GET  /api/import/queue               — estado atual da fila (Fase 5)
 * POST /api/import/cancel/:id          — cancela job queued ou processing (Fase 5)
 * POST /api/import/enrich              — dispara LLM enrichment
 */

import { Request, Response } from 'express';
import * as multer from 'multer';
import { ImportJobRepository } from '../repositories/OperationalRepositories';
import { LLMEnrichmentService } from '../services/LLMEnrichmentService';
import { hashFile } from '../scripts/import-utils';
import { importEventBus, ImportEventHandler } from './ImportEventBus';
import { importQueue } from './ImportQueue';
import { parsePaginationOptions } from '../utils/pagination';
import type { ImportJobStatus } from '../../domain/entities/OperationalEntities';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

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
      'text/csv',
      'application/csv',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xlsx, .xls e .csv são aceitos'));
    }
  },
}).single('file');

export class ImportController {
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

      // Impede reprocessar o mesmo arquivo já importado (done)
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

      // Impede duplicata com job ativo (queued ou processing)
      const activeJob = await this.importJobRepo.findActiveByFileHash(fileHash);
      if (activeJob) {
        console.log(`[ImportController.uploadAndProcess] file already active as job ${activeJob.id} (${activeJob.status})`);
        res.status(409).json({
          success: false,
          error: `Arquivo já está sendo processado (job ${activeJob.id}, status: ${activeJob.status})`,
          data: { importJobId: activeJob.id, status: activeJob.status },
        });
        return;
      }

      const importJob = await this.importJobRepo.create({ filename, fileHash, createdBy });
      console.log(`[ImportController.uploadAndProcess] import job created: ${importJob.id} | enqueueing...`);

      const queuePosition = await importQueue.enqueue(importJob.id, buffer, filename);

      const message = queuePosition === 0
        ? 'Upload recebido. Processamento iniciado.'
        : `Upload recebido. Aguardando na fila (posição ${queuePosition}).`;

      res.status(202).json({
        success: true,
        data: {
          importJobId: importJob.id,
          filename,
          message,
          queuePosition,
          statusUrl: `/api/import/status/${importJob.id}`,
          streamUrl: `/api/import/status/${importJob.id}/stream`,
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
          currentPhase: job.currentPhase,
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
          logs: job.logs?.slice(-100) ?? [],
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          cancelledAt: job.cancelledAt,
          duration: job.startedAt && job.finishedAt
            ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
            : null,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  /**
   * GET /api/import/status/:id/stream
   *
   * Server-Sent Events — push de eventos em tempo real durante o import.
   * Se o job já está done/error/cancelled, replica os logs do DB e fecha imediatamente.
   * Se o job está queued, emite posição atual e aguarda eventos do bus.
   *
   * Eventos SSE emitidos: phase | progress | log | complete | error | queued | cancelled
   */
  async streamStatus(req: Request, res: Response): Promise<void> {
    const jobId = req.params.id;

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desabilita buffer do nginx/Cloud Run
    res.flushHeaders();

    const sendEvent = (eventName: string, data: unknown): void => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const job = await this.importJobRepo.findById(jobId);
      if (!job) {
        sendEvent('error', { message: 'Import job não encontrado' });
        res.end();
        return;
      }

      // ── Job terminal → replay do DB e fecha ─────────────────────────────
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
        const progressPercent = job.totalRows > 0
          ? Math.round((job.processedRows / job.totalRows) * 100) : 0;
        for (const log of (job.logs ?? [])) sendEvent('log', log);

        if (job.status === 'cancelled') {
          sendEvent('cancelled', { by: 'user' });
        } else {
          const terminalEvent = job.status === 'done' ? 'complete' : 'error';
          const logs = job.logs ?? [];
          // Para jobs com erro, inclui message a partir do último log de nível 'error'
          const errorMessage = job.status === 'error'
            ? (logs.slice().reverse().find(l => l.level === 'error')?.message ?? 'Erro no import')
            : undefined;
          sendEvent(terminalEvent, {
            id: job.id,
            status: job.status,
            currentPhase: job.currentPhase,
            ...(errorMessage !== undefined && { message: errorMessage }),
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
            logs: logs.slice(-100),
            duration: job.startedAt && job.finishedAt
              ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
              : null,
          });
        }
        res.end();
        return;
      }

      // ── Job em andamento ou na fila → subscreve no bus ───────────────────
      let cleanedUp = false;
      const cleanupFns: Array<() => void> = [];
      const cleanup = (): void => {
        if (cleanedUp) return;
        cleanedUp = true;
        cleanupFns.forEach(fn => fn());
      };

      const timeout = setTimeout(() => {
        sendEvent('error', { message: 'Stream timeout (10 min)' });
        cleanup();
        res.end();
      }, STREAM_TIMEOUT_MS);
      cleanupFns.push(() => clearTimeout(timeout));

      const handler: ImportEventHandler = (event) => {
        if (cleanedUp) return;
        if (event.type === 'phase') {
          sendEvent('phase', { phase: event.phase, at: event.at });
        } else if (event.type === 'progress') {
          const { type: _t, ...rest } = event;
          sendEvent('progress', rest);
        } else if (event.type === 'log') {
          const { type: _t, ...rest } = event;
          sendEvent('log', rest);
        } else if (event.type === 'queued') {
          sendEvent('queued', { position: event.position, queueLength: event.queueLength });
        } else if (event.type === 'complete') {
          const { type: _t, ...rest } = event;
          sendEvent('complete', rest);
          cleanup();
          res.end();
        } else if (event.type === 'error') {
          sendEvent('error', { message: event.message });
          cleanup();
          res.end();
        } else if (event.type === 'cancelled') {
          sendEvent('cancelled', { by: event.by });
          cleanup();
          res.end();
        }
      };

      const unsubscribe = importEventBus.subscribe(jobId, handler);
      cleanupFns.push(unsubscribe);

      req.on('close', cleanup);

      // Re-verifica status (race: job pode ter mudado entre findById e subscribe)
      const refreshed = await this.importJobRepo.findById(jobId);
      if (refreshed && !cleanedUp) {
        if (refreshed.status === 'done' || refreshed.status === 'error' || refreshed.status === 'cancelled') {
          const progressPercent = refreshed.totalRows > 0
            ? Math.round((refreshed.processedRows / refreshed.totalRows) * 100) : 0;
          for (const log of (refreshed.logs ?? [])) sendEvent('log', log);
          if (refreshed.status === 'cancelled') {
            sendEvent('cancelled', { by: 'user' });
          } else {
            const terminalEvent = refreshed.status === 'done' ? 'complete' : 'error';
            const rLogs = refreshed.logs ?? [];
            const rErrorMessage = refreshed.status === 'error'
              ? (rLogs.slice().reverse().find(l => l.level === 'error')?.message ?? 'Erro no import')
              : undefined;
            sendEvent(terminalEvent, {
              id: refreshed.id, status: refreshed.status, currentPhase: refreshed.currentPhase,
              ...(rErrorMessage !== undefined && { message: rErrorMessage }),
              progress: { percent: progressPercent, totalRows: refreshed.totalRows, processedRows: refreshed.processedRows, errorRows: refreshed.errorRows, skippedRows: refreshed.skippedRows },
              results: { workersCreated: refreshed.workersCreated, workersUpdated: refreshed.workersUpdated, casesCreated: refreshed.casesCreated, casesUpdated: refreshed.casesUpdated, encuadresCreated: refreshed.encuadresCreated, encuadresSkipped: refreshed.encuadresSkipped },
              logs: rLogs.slice(-100),
              duration: refreshed.startedAt && refreshed.finishedAt
                ? `${Math.round((refreshed.finishedAt.getTime() - refreshed.startedAt.getTime()) / 1000)}s` : null,
            });
          }
          cleanup();
          res.end();
        } else if (refreshed.status === 'queued') {
          // Emite posição atual para o cliente que acabou de conectar
          const qpos = importQueue.getQueuePosition(jobId);
          if (qpos) sendEvent('queued', qpos);
        }
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Erro interno' })}\n\n`);
      res.end();
    }
  }

  /**
   * GET /api/import/history
   *
   * Query params:
   *   page    — número da página (default: 1)
   *   limit   — itens por página, 1–100 (default: 20)
   *   status  — filtra por status: pending | processing | queued | done | error | cancelled
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      let options: { page: number; limit: number };
      try {
        options = parsePaginationOptions({ page: req.query.page, limit: req.query.limit ?? '20' });
      } catch (validationErr) {
        res.status(400).json({ success: false, error: (validationErr as Error).message });
        return;
      }

      const statusFilter = req.query.status as ImportJobStatus | undefined;
      const VALID_STATUSES: ImportJobStatus[] = ['pending', 'processing', 'queued', 'done', 'error', 'cancelled'];
      if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
        res.status(400).json({ success: false, error: `status inválido: "${statusFilter}"` });
        return;
      }

      const [jobs, total] = await Promise.all([
        this.importJobRepo.listPaginated({ ...options, status: statusFilter }),
        this.importJobRepo.count(statusFilter),
      ]);

      const totalPages = Math.ceil(total / options.limit);

      res.status(200).json({
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          filename: job.filename,
          status: job.status,
          currentPhase: job.currentPhase,
          workersCreated: job.workersCreated,
          encuadresCreated: job.encuadresCreated,
          encuadresSkipped: job.encuadresSkipped,
          errorRows: job.errorRows,
          createdBy: job.createdBy,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          cancelledAt: job.cancelledAt,
          duration: job.startedAt && job.finishedAt
            ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
            : null,
        })),
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          totalPages,
          hasNext: options.page < totalPages,
          hasPrev: options.page > 1,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  /** GET /api/import/queue — estado atual da fila de imports. */
  async getQueue(_req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: importQueue.getState(),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }

  /** POST /api/import/cancel/:id — cancela job queued ou processing. */
  async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const result = await importQueue.cancel(req.params.id);

      switch (result) {
        case 'cancelled_queued':
          res.status(200).json({
            success: true,
            message: 'Job removido da fila e cancelado.',
            data: { status: 'cancelled' },
          });
          break;
        case 'cancelled_running':
          res.status(200).json({
            success: true,
            message: 'Cancelamento solicitado. O import parará na próxima janela (≤ 100 linhas).',
            data: { status: 'cancelling' },
          });
          break;
        case 'not_found':
          res.status(404).json({ success: false, error: 'Import job não encontrado' });
          break;
        case 'already_terminal':
          res.status(409).json({ success: false, error: 'Job já concluído, com erro ou cancelado' });
          break;
      }
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

  private async runEnrichmentAsync(batchSize: number): Promise<void> {
    const service = new LLMEnrichmentService();
    const result = await service.enrichPending(batchSize);
    console.log(`[Enrichment] ${result.processed} processados, ${result.errors} erros`);
  }
}
