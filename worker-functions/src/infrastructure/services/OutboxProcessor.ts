import { Pool } from 'pg';
import { IMessagingService } from '../../domain/ports/IMessagingService';

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;

interface OutboxRow {
  id: string;
  worker_id: string;
  template_slug: string;
  variables: Record<string, string>;
  attempts: number;
}

/**
 * Processa registros pending em messaging_outbox, enviando via IMessagingService.
 * Chamado via polling (setInterval) ou manualmente após imports em lote.
 *
 * Estratégia de retry: máximo MAX_ATTEMPTS tentativas por mensagem.
 * Após MAX_ATTEMPTS falhas consecutivas, o registro fica com status='failed'.
 */
export class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly messaging: IMessagingService,
    private readonly db: Pool,
  ) {}

  /** Inicia polling periódico. Idempotente: chamadas extras são ignoradas. */
  start(intervalMs: number = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processBatch().catch(err =>
        console.error('[OutboxProcessor] Erro inesperado no batch:', err),
      );
    }, intervalMs);
    console.log(`[OutboxProcessor] Iniciado (intervalo=${intervalMs}ms)`);
  }

  /** Para o polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Processa um batch de registros pending. Pode ser chamado diretamente nos testes. */
  async processBatch(): Promise<void> {
    const rows = await this.fetchPending();
    if (rows.length === 0) return;

    for (const row of rows) {
      await this.processOne(row);
    }
  }

  private async fetchPending(): Promise<OutboxRow[]> {
    const result = await this.db.query<OutboxRow>(
      `SELECT id, worker_id, template_slug, variables, attempts
       FROM messaging_outbox
       WHERE status = 'pending' AND attempts < $1
       ORDER BY created_at
       LIMIT $2`,
      [MAX_ATTEMPTS, BATCH_SIZE],
    );
    return result.rows;
  }

  private async processOne(row: OutboxRow): Promise<void> {
    // Busca telefone do worker (prefere whatsapp_phone, fallback para phone)
    const workerResult = await this.db.query<{ whatsapp_phone: string | null; phone: string | null }>(
      `SELECT whatsapp_phone, phone FROM workers WHERE id = $1 LIMIT 1`,
      [row.worker_id],
    );

    if (workerResult.rows.length === 0) {
      await this.markFailed(row.id, row.attempts, 'Worker não encontrado');
      return;
    }

    const { whatsapp_phone, phone } = workerResult.rows[0];
    const to = whatsapp_phone || phone;

    if (!to) {
      await this.markFailed(row.id, row.attempts, 'Worker sem telefone cadastrado');
      return;
    }

    const result = await this.messaging.sendWhatsApp({
      to,
      templateSlug: row.template_slug,
      variables: row.variables,
    });

    if (result.isFailure) {
      const newAttempts = row.attempts + 1;
      const isFinal = newAttempts >= MAX_ATTEMPTS;
      await this.db.query(
        `UPDATE messaging_outbox
         SET attempts = $1,
             status = $2,
             error = $3,
             processed_at = NOW()
         WHERE id = $4`,
        [newAttempts, isFinal ? 'failed' : 'pending', result.error, row.id],
      );
      if (isFinal) {
        console.warn(`[OutboxProcessor] Falha definitiva outbox=${row.id}: ${result.error}`);
      }
      return;
    }

    await this.db.query(
      `UPDATE messaging_outbox
       SET status = 'sent',
           attempts = $1,
           processed_at = NOW(),
           error = NULL
       WHERE id = $2`,
      [row.attempts + 1, row.id],
    );
  }

  private async markFailed(id: string, attempts: number, error: string): Promise<void> {
    await this.db.query(
      `UPDATE messaging_outbox
       SET status = 'failed',
           attempts = $1,
           error = $2,
           processed_at = NOW()
       WHERE id = $3`,
      [attempts + 1, error, id],
    );
  }
}
