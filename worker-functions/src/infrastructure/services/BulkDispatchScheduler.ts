import { Pool } from 'pg';
import { IMessagingService } from '../../domain/ports/IMessagingService';
import { BulkDispatchIncompleteWorkersUseCase } from '../../application/use-cases/BulkDispatchIncompleteWorkersUseCase';

// Horário do disparo diário em fuso de Brasília (UTC-3)
const SCHEDULE_HOUR_BRT   = 10;
const SCHEDULE_MINUTE_BRT = 0;
const BRT_OFFSET_MS       = -3 * 60 * 60 * 1000; // UTC-3
const ONE_DAY_MS          = 24 * 60 * 60 * 1000;

/**
 * Agenda o BulkDispatchIncompleteWorkersUseCase para rodar todos os dias às 10h (Brasília).
 *
 * Implementação sem dependências externas:
 *   1. Calcula ms até a próxima 10h BRT
 *   2. setTimeout para o primeiro disparo
 *   3. setInterval(24h) para os subsequentes
 */
export class BulkDispatchScheduler {
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Pool,
    private readonly messaging: IMessagingService,
  ) {}

  /** Inicia o agendamento. Idempotente: chamadas extras são ignoradas. */
  start(): void {
    if (this.timeout || this.interval) return;

    const msUntilFirst = this.msUntilNext(SCHEDULE_HOUR_BRT, SCHEDULE_MINUTE_BRT);
    const nextRun = new Date(Date.now() + msUntilFirst);

    console.log(
      `[BulkDispatchScheduler] Primeiro disparo agendado para ${nextRun.toISOString()} ` +
      `(${Math.round(msUntilFirst / 60_000)} min)`,
    );

    this.timeout = setTimeout(() => {
      this.run();
      // Após o primeiro disparo, repete a cada 24h
      this.interval = setInterval(() => this.run(), ONE_DAY_MS);
    }, msUntilFirst);
  }

  /** Para o agendamento. */
  stop(): void {
    if (this.timeout)  { clearTimeout(this.timeout);   this.timeout  = null; }
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async run(): Promise<void> {
    console.log('[BulkDispatchScheduler] Iniciando disparo agendado...');
    try {
      const useCase = new BulkDispatchIncompleteWorkersUseCase(this.db, this.messaging);
      const result  = await useCase.execute('scheduler');

      if (result.isFailure) {
        console.error('[BulkDispatchScheduler] Falha no disparo:', result.error);
        return;
      }

      const { total, sent, errors } = result.getValue()!;
      console.log(`[BulkDispatchScheduler] Concluído — total=${total} sent=${sent} errors=${errors}`);
    } catch (err) {
      console.error('[BulkDispatchScheduler] Erro inesperado:', err);
    }
  }

  /**
   * Calcula ms até a próxima ocorrência de hour:minute no fuso BRT (UTC-3).
   * Se a hora já passou hoje, agenda para amanhã.
   */
  private msUntilNext(hour: number, minute: number): number {
    const nowUtcMs  = Date.now();
    const nowBrtMs  = nowUtcMs + BRT_OFFSET_MS;

    // Zera segundos/ms no fuso BRT
    const nowBrtDate = new Date(nowBrtMs);
    const todayBrtMs = nowBrtMs - (
      nowBrtDate.getUTCHours()   * 3_600_000 +
      nowBrtDate.getUTCMinutes() * 60_000    +
      nowBrtDate.getUTCSeconds() * 1_000     +
      nowBrtDate.getUTCMilliseconds()
    );

    const targetBrtMs = todayBrtMs + hour * 3_600_000 + minute * 60_000;

    // Se já passou hoje, agenda para amanhã
    const diff = targetBrtMs - nowBrtMs;
    return diff > 0 ? diff : diff + ONE_DAY_MS;
  }
}
