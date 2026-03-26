/**
 * ImportEventBus
 * Singleton in-memory event bus para push de eventos de import em tempo real (SSE).
 *
 * Emissores: PlanilhaImporter (phase / log) + ImportController (progress / complete / error)
 * Consumidores: ImportController.streamStatus()
 *
 * IMPORTANTE: funciona apenas dentro do mesmo processo Node.js.
 * Para múltiplas réplicas do servidor, seria necessário Redis Pub/Sub.
 */

import { EventEmitter } from 'events';
import type { ImportLogLine, ImportPhase } from '../../domain/entities/OperationalEntities';

// ─── Tipos de evento ──────────────────────────────────────────────────────────

export type ImportEvent =
  | { type: 'phase';     phase: ImportPhase; at: string }
  | { type: 'progress';  percent: number; processedRows: number; totalRows: number;
      workersCreated: number; workersUpdated: number;
      casesCreated: number; casesUpdated: number;
      encuadresCreated: number; encuadresSkipped: number;
      errorRows: number }
  | { type: 'log';       ts: string; level: ImportLogLine['level']; message: string }
  | { type: 'complete';  id: string; status: string; currentPhase: string;
      progress: object; results: object; logs: ImportLogLine[]; duration: string | null }
  | { type: 'error';     message: string }
  | { type: 'queued';    position: number; queueLength: number }
  | { type: 'cancelled'; by: 'user' | 'system' };

export type ImportEventHandler = (event: ImportEvent) => void;

// ─── Bus ──────────────────────────────────────────────────────────────────────

class ImportEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Suporta até 200 subscribers simultâneos sem warning do Node.js
    this.emitter.setMaxListeners(200);
  }

  /**
   * Subscreve um handler para os eventos de um job.
   * Retorna função de cancelamento (unsubscribe).
   */
  subscribe(jobId: string, handler: ImportEventHandler): () => void {
    this.emitter.on(jobId, handler);
    return () => this.emitter.off(jobId, handler);
  }

  /**
   * Emite um evento para todos os subscribers do job.
   * Fire-and-forget — nunca lança exceção.
   */
  emit(jobId: string, event: ImportEvent): void {
    try {
      this.emitter.emit(jobId, event);
    } catch {
      // Não deixar erro de subscriber quebrar o import
    }
  }
}

export const importEventBus = new ImportEventBus();
