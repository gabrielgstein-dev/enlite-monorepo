import { Pool } from 'pg';
import { Result } from '../../domain/shared/Result';
import { canTransition } from '../../domain/entities/InterviewStateMachine';
import { formatDateUTC, formatTimeUTC } from '../../domain/shared/dateFormatters';
import { PubSubClient } from '../../infrastructure/events/PubSubClient';
import { TokenService } from '../../infrastructure/services/TokenService';
import { GoogleCalendarService } from '../../infrastructure/services/GoogleCalendarService';

interface PendingApplication {
  id: string;
  job_posting_id: string;
  interview_response: string;
  interview_meet_link: string | null;
  interview_datetime: string | null;
  interview_slot_id: string | null;
}

/**
 * HandleReminderResponseUseCase — Step 8 do roadmap.
 *
 * Processa resposta do worker ao reminder de confirmação (24h antes):
 *   - confirm_yes → marca interview_response = 'confirmed'
 *   - confirm_no  → libera slot, remove do Calendar, notifica admin
 *
 * Usa InterviewStateMachine para validar transições.
 */
export class HandleReminderResponseUseCase {
  constructor(
    private readonly db: Pool,
    private readonly pubsub: PubSubClient,
    private readonly tokenService: TokenService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) {}

  async execute(fromPhone: string, buttonPayload: string): Promise<Result<void>> {
    // 1. Identificar worker
    const phone = this.normalizePhone(fromPhone);
    const workerResult = await this.db.query(
      `SELECT id, email FROM workers WHERE phone = $1 LIMIT 1`,
      [phone],
    );

    if (workerResult.rows.length === 0) {
      console.warn(`[HandleReminderResponse] Worker not found for phone ${phone}`);
      return Result.fail('Worker not found');
    }

    const worker = workerResult.rows[0] as { id: string; email: string | null };

    // 2. Buscar application com entrevista agendada
    const appResult = await this.db.query(
      `SELECT id, job_posting_id, interview_response,
              interview_meet_link, interview_datetime, interview_slot_id
       FROM worker_job_applications
       WHERE worker_id = $1
         AND interview_response IN ('pending', 'confirmed')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [worker.id],
    );

    if (appResult.rows.length === 0) {
      console.warn(`[HandleReminderResponse] No pending interview for worker ${worker.id}`);
      return Result.fail('No pending interview');
    }

    const application = appResult.rows[0] as PendingApplication;

    // 3. Processar confirm_yes
    if (buttonPayload === 'confirm_yes') {
      if (!canTransition(application.interview_response, 'confirmed')) {
        return Result.fail('Invalid transition');
      }

      await this.db.query(
        `UPDATE worker_job_applications
         SET interview_response    = 'confirmed',
             interview_responded_at = NOW(),
             updated_at             = NOW()
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [worker.id, application.job_posting_id],
      );

      return Result.ok();
    }

    // 4. Processar confirm_no (declínio completo)
    if (buttonPayload === 'confirm_no') {
      if (!canTransition(application.interview_response, 'declined')) {
        return Result.fail('Invalid transition');
      }

      // 4a. Liberar slot se existir
      if (application.interview_slot_id) {
        await this.db.query(
          `UPDATE interview_slots
           SET booked_count = GREATEST(booked_count - 1, 0),
               updated_at   = NOW()
           WHERE id = $1`,
          [application.interview_slot_id],
        );
      }

      // 4b. Remover do Google Calendar
      if (application.interview_meet_link && worker.email) {
        await this.googleCalendarService.removeGuestFromMeeting(
          application.interview_meet_link,
          worker.email,
        );
      }

      // 4c. Salvar declínio
      await this.db.query(
        `UPDATE worker_job_applications
         SET interview_response     = 'declined',
             interview_responded_at = NOW(),
             interview_meet_link    = NULL,
             interview_datetime     = NULL,
             interview_slot_id      = NULL,
             updated_at             = NOW()
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [worker.id, application.job_posting_id],
      );

      // 4d. Notificar admin via outbox
      const nameToken = await this.tokenService.generate(worker.id, 'worker_first_name');

      const vacancyResult = await this.db.query(
        `SELECT title FROM job_postings WHERE id = $1`,
        [application.job_posting_id],
      );
      const vacancyName = vacancyResult.rows[0]?.title ?? 'N/A';

      const outboxResult = await this.db.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
         VALUES ($1, 'qualified_declined_admin', $2::jsonb, 'pending', 0)
         RETURNING id`,
        [
          worker.id,
          JSON.stringify({
            name: nameToken,
            worker_id: worker.id,
            date: application.interview_datetime ? formatDateUTC(application.interview_datetime) : '',
            time: application.interview_datetime ? formatTimeUTC(application.interview_datetime) : '',
            vacancy_name: vacancyName,
          }),
        ],
      );

      const outboxId = outboxResult.rows[0].id;
      await this.pubsub.publish('outbox-enqueued', { outboxId });

      console.log(
        `[HandleReminderResponse] Worker ${worker.id} declined interview for job ${application.job_posting_id}`,
      );

      return Result.ok();
    }

    return Result.fail('Unknown button payload');
  }

  private normalizePhone(from: string): string {
    return from.replace(/^whatsapp:/, '');
  }
}
