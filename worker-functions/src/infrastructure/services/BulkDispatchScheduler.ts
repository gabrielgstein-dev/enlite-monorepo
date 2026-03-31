import { Pool } from 'pg';
import { IMessagingService } from '../../domain/ports/IMessagingService';
import { BulkDispatchIncompleteWorkersUseCase } from '../../application/use-cases/BulkDispatchIncompleteWorkersUseCase';

/**
 * BulkDispatchScheduler — dispara bulk dispatch de workers incompletos.
 *
 * Método stateless `run()` chamado via Cloud Scheduler (diário 10h BRT)
 * através do endpoint POST /api/internal/bulk-dispatch/process.
 */
export class BulkDispatchScheduler {
  constructor(
    private readonly db: Pool,
    private readonly messaging: IMessagingService,
  ) {}

  /** Executa o bulk dispatch. Stateless — chamado via Cloud Scheduler. */
  async run(): Promise<{ total: number; sent: number; errors: number }> {
    console.log('[BulkDispatchScheduler] Iniciando disparo...');

    const useCase = new BulkDispatchIncompleteWorkersUseCase(this.db, this.messaging);
    const result = await useCase.execute('scheduler');

    if (result.isFailure) {
      console.error('[BulkDispatchScheduler] Falha no disparo:', result.error);
      throw new Error(result.error);
    }

    const { total, sent, errors } = result.getValue()!;
    console.log(`[BulkDispatchScheduler] Concluído — total=${total} sent=${sent} errors=${errors}`);
    return { total, sent, errors };
  }
}
