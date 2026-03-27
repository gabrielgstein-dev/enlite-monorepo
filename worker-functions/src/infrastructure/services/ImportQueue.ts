/**
 * ImportQueue — fila serializada de imports com suporte a cancelamento (Fase 5).
 *
 * Garante que nunca haja dois imports em 'processing' simultaneamente,
 * evitando saturação do banco em uploads concorrentes.
 *
 * Thread-safety: Node.js é single-threaded para código síncrono.
 * Operações síncronas em `this.queue` e `this.running` são livre de race condition.
 */

import { PlanilhaImporter, ImportCancelledError } from '../scripts/import-planilhas';
import { ImportJobRepository } from '../repositories/OperationalRepositories';
import { importEventBus } from './ImportEventBus';
import type { ImportJobStatus } from '../../domain/entities/OperationalEntities';

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface QueueEntry {
  jobId: string;
  buffer: Buffer;
  filename: string;
  abortController: AbortController;
  enqueuedAt: Date;
}

// ─── ImportQueue ───────────────────────────────────────────────────────────────

class ImportQueue {
  private queue: QueueEntry[] = [];
  private running: QueueEntry | null = null;
  private readonly importer = new PlanilhaImporter();
  private readonly importJobRepo = new ImportJobRepository();

  /**
   * Chamado no startup do servidor.
   * Marca como cancelados/error jobs que ficaram travados por um restart anterior.
   * Idempotente — pode ser chamado múltiplas vezes sem efeito colateral.
   */
  async initialize(): Promise<void> {
    const stale = await this.importJobRepo.findStaleInProgress();
    for (const job of stale) {
      if (job.status === 'queued') {
        await this.importJobRepo.cancel(job.id);
        await this.importJobRepo.appendLog(job.id, {
          ts: new Date().toISOString(),
          level: 'warn',
          message: 'Servidor reiniciado. Re-envie o arquivo.',
        });
        importEventBus.emit(job.id, { type: 'cancelled', by: 'system' });
      } else if (job.status === 'processing') {
        await this.importJobRepo.updateStatus(job.id, 'error' as ImportJobStatus);
        await this.importJobRepo.appendLog(job.id, {
          ts: new Date().toISOString(),
          level: 'error',
          message: 'Import interrompido por restart do servidor.',
        });
        importEventBus.emit(job.id, {
          type: 'error',
          message: 'Import interrompido por restart do servidor.',
        });
      }
    }
  }

  /**
   * Adiciona um job à fila.
   * Se não houver nada rodando, inicia imediatamente (queuePosition = 0).
   * Retorna a posição na fila (0 = iniciou agora, 1+ = aguardando).
   */
  async enqueue(jobId: string, buffer: Buffer, filename: string): Promise<number> {
    const entry: QueueEntry = {
      jobId,
      buffer,
      filename,
      abortController: new AbortController(),
      enqueuedAt: new Date(),
    };

    if (!this.running) {
      // Slot livre — inicia imediatamente
      this.running = entry;
      this.doRun(entry).catch(err => {
        console.error(`[ImportQueue] Unhandled error for job ${jobId}:`, err);
      });
      return 0;
    }

    // Adiciona à fila e marca o job no DB
    this.queue.push(entry);
    await this.importJobRepo.setQueued(jobId);

    const position = this.queue.length; // 1-based
    importEventBus.emit(jobId, { type: 'queued', position, queueLength: this.queue.length });

    return position;
  }

  /**
   * Cancela um job queued ou running.
   * Retorna o resultado da operação para tradução em resposta HTTP.
   */
  async cancel(jobId: string): Promise<'cancelled_queued' | 'cancelled_running' | 'not_found' | 'already_terminal'> {
    // Verifica na fila em memória
    const queuedIdx = this.queue.findIndex(e => e.jobId === jobId);
    if (queuedIdx !== -1) {
      this.queue.splice(queuedIdx, 1);
      await this.importJobRepo.cancel(jobId);
      importEventBus.emit(jobId, { type: 'cancelled', by: 'user' });
      // Notifica jobs restantes sobre as posições atualizadas
      this.queue.forEach((e, idx) => {
        importEventBus.emit(e.jobId, {
          type: 'queued',
          position: idx + 1,
          queueLength: this.queue.length,
        });
      });
      return 'cancelled_queued';
    }

    // Verifica se está rodando agora
    if (this.running?.jobId === jobId) {
      // Aborta o signal — doRun captura ImportCancelledError e gerencia o estado
      this.running.abortController.abort();
      return 'cancelled_running';
    }

    // Verifica no DB para distinguir not_found de already_terminal
    const job = await this.importJobRepo.findById(jobId);
    if (!job) return 'not_found';

    const terminalStatuses: ImportJobStatus[] = ['done', 'error', 'cancelled'];
    if (terminalStatuses.includes(job.status)) return 'already_terminal';

    return 'not_found';
  }

  /** Retorna estado atual da fila (para GET /api/import/queue). */
  getState(): { running: object | null; queued: object[] } {
    return {
      running: this.running ? {
        jobId: this.running.jobId,
        filename: this.running.filename,
        enqueuedAt: this.running.enqueuedAt,
      } : null,
      queued: this.queue.map((entry, idx) => ({
        jobId: entry.jobId,
        filename: entry.filename,
        position: idx + 1,
        enqueuedAt: entry.enqueuedAt,
      })),
    };
  }

  /** Retorna posição atual de um job na fila (para streamStatus emitir ao conectar). */
  getQueuePosition(jobId: string): { position: number; queueLength: number } | null {
    const idx = this.queue.findIndex(e => e.jobId === jobId);
    if (idx === -1) return null;
    return { position: idx + 1, queueLength: this.queue.length };
  }

  // ─── Privados ───────────────────────────────────────────────────────────────

  /** Inicia o próximo job da fila se houver slot livre. */
  private runNext(): void {
    if (this.running !== null) return;
    const next = this.queue.shift();
    if (!next) return;

    this.running = next;

    // Notifica jobs restantes sobre posições atualizadas
    this.queue.forEach((e, idx) => {
      importEventBus.emit(e.jobId, {
        type: 'queued',
        position: idx + 1,
        queueLength: this.queue.length,
      });
    });

    this.doRun(next).catch(err => {
      console.error(`[ImportQueue] Unhandled error for job ${next.jobId}:`, err);
    });
  }

  /**
   * Executa um job de import.
   * Contém a lógica de orquestração equivalente ao antigo ImportController.runImportAsync().
   * Captura ImportCancelledError → marca cancelled e emite no bus.
   * ImportCancelledError não é propagado ao log de erros como erro inesperado.
   */
  private async doRun(entry: QueueEntry): Promise<void> {
    const { jobId, buffer, filename, abortController } = entry;
    const startTime = Date.now();
    console.log(`[ImportQueue] START | job: ${jobId} | file: "${filename}"`);

    try {
      await this.importer.importBuffer(
        buffer,
        filename,
        jobId,
        (progress) => {
          const { processedRows, totalRows } = progress;
          const percent = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;

          this.importJobRepo.updateProgress(jobId, {
            totalRows,
            processedRows,
            errorRows: progress.errors.length,
            encuadresCreated: progress.encuadresCreated,
            encuadresSkipped: progress.encuadresSkipped,
            workersCreated: progress.workersCreated,
            workersUpdated: progress.workersUpdated,
            casesCreated: progress.casesCreated,
            casesUpdated: progress.casesUpdated,
          }).catch(() => {});

          importEventBus.emit(jobId, {
            type: 'progress',
            percent, processedRows, totalRows,
            workersCreated: progress.workersCreated,
            workersUpdated: progress.workersUpdated,
            casesCreated: progress.casesCreated,
            casesUpdated: progress.casesUpdated,
            encuadresCreated: progress.encuadresCreated,
            encuadresSkipped: progress.encuadresSkipped,
            errorRows: progress.errors.length,
          });

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[Import ${jobId}] ${progress.sheet}: ${processedRows}/${totalRows} (${elapsed}s)`);
        },
        abortController.signal,
      );

      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[ImportQueue] COMPLETE | job: ${jobId} | elapsed: ${totalElapsed}s`);

      // Emite complete com dados finais do DB
      const job = await this.importJobRepo.findById(jobId);
      if (job) {
        const progressPercent = job.totalRows > 0
          ? Math.round((job.processedRows / job.totalRows) * 100) : 0;
        importEventBus.emit(jobId, {
          type: 'complete',
          id: job.id,
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
          logs: job.logs?.slice(-100) ?? [],
          duration: job.startedAt && job.finishedAt
            ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
            : null,
        });
      }
    } catch (err) {
      if (err instanceof ImportCancelledError) {
        // Cancelamento esperado — não logar como erro fatal
        console.log(`[ImportQueue] CANCELLED | job: ${jobId}`);
        await this.importJobRepo.cancel(jobId);
        importEventBus.emit(jobId, { type: 'cancelled', by: 'user' });
      } else {
        const errMessage = (err as Error).message ?? 'Erro desconhecido no import';
        console.error(`[ImportQueue] ERROR | job: ${jobId}:`, errMessage);

        // Garante status='error' no DB — importBuffer já pode ter feito isso,
        // mas se o erro ocorreu APÓS importBuffer (ex: findById), o status pode estar 'done'
        await this.importJobRepo.updateStatus(jobId, 'error').catch(() => {});

        // Persiste o erro como log para aparecer na tela (mesmo que appendLog do importBuffer falhou)
        await this.importJobRepo.appendLog(jobId, {
          ts: new Date().toISOString(),
          level: 'error',
          message: `Erro fatal: ${errMessage}`,
        }).catch(() => {});

        importEventBus.emit(jobId, {
          type: 'error',
          message: errMessage,
        });
      }
    } finally {
      this.running = null;
      this.runNext();
    }
  }
}

export const importQueue = new ImportQueue();
