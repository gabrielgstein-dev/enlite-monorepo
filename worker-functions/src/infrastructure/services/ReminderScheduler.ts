import { Pool } from 'pg';
import { CloudTasksClient } from '../events/CloudTasksClient';
import { PubSubClient } from '../events/PubSubClient';
import { TokenService } from './TokenService';
import { formatDateUTC, formatTimeUTC } from '../../domain/shared/dateFormatters';

const REMINDER_QUEUE = 'interview-reminders';

/**
 * ReminderScheduler — agenda e processa lembretes de entrevista.
 *
 * Dois fluxos:
 *   - Encuadre (antigo): opera sobre tabela encuadres, templates encuadre_reminder_*
 *   - Qualified Interview (Step 7-8): opera sobre worker_job_applications,
 *     template qualified_reminder_confirm (interativo Sí/No)
 *
 * Métodos:
 *   - scheduleReminders(): agenda Cloud Tasks (24h + 5min antes)
 *   - processQualifiedReminder(): fluxo encuadre (Cloud Task 24h antes)
 *   - processQualifiedInterviewReminder(): fluxo QUALIFIED via WJA (Cloud Task 24h antes)
 *   - processBatch(): safety net (Cloud Scheduler)
 */
export class ReminderScheduler {
  constructor(
    private readonly db: Pool,
    private readonly cloudTasks: CloudTasksClient,
    private readonly pubsub?: PubSubClient,
    private readonly tokenService?: TokenService,
  ) {}

  /**
   * Agenda Cloud Tasks para 24h e 5min antes da entrevista.
   * Chamado no momento do booking (InterviewSchedulingService.bookSlot).
   * Retorna os nomes das tasks para eventual cancelamento.
   */
  async scheduleReminders(
    slotDatetime: string,
    workerId: string,
    jobPostingId: string,
  ): Promise<{ taskNames: string[] }> {
    const dt = new Date(slotDatetime);
    const taskNames: string[] = [];

    // 24h antes
    const reminder24h = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
    const task24h = await this.cloudTasks.schedule({
      queue: REMINDER_QUEUE,
      url: '/api/internal/reminders/qualified',
      body: { workerId, jobPostingId },
      scheduleTime: reminder24h.toISOString(),
    });
    if (task24h) taskNames.push(task24h);

    // 5min antes
    const reminder5min = new Date(dt.getTime() - 5 * 60 * 1000);
    const task5min = await this.cloudTasks.schedule({
      queue: REMINDER_QUEUE,
      url: '/api/internal/reminders/5min',
      body: { workerId, jobPostingId },
      scheduleTime: reminder5min.toISOString(),
    });
    if (task5min) taskNames.push(task5min);

    return { taskNames };
  }

  /**
   * Cancela Cloud Tasks agendados (ex: slot cancelado pelo worker).
   */
  async cancelReminders(taskNames: string[]): Promise<void> {
    for (const name of taskNames) {
      await this.cloudTasks.deleteTask(name);
    }
  }

  /**
   * Processa um lembrete de 24h antes para um worker específico.
   * Chamado via Cloud Task → POST /api/internal/reminders/qualified
   *
   * Tenta primeiro o fluxo QUALIFIED (worker_job_applications).
   * Se não encontrar, cai no fluxo legado (encuadres).
   */
  async processQualifiedReminder(workerId: string, jobPostingId: string): Promise<void> {
    // Fluxo QUALIFIED (Step 8): worker_job_applications
    const handled = await this.processQualifiedInterviewReminder(workerId, jobPostingId);
    if (handled) return;

    // Fallback: fluxo encuadres (legado)
    await this.processEncuadreReminder(workerId);
  }

  /**
   * Fluxo QUALIFIED (Step 8): envia reminder interativo (Sí/No) via worker_job_applications.
   *
   * Idempotência: pula se interview_reminder_sent_at já está preenchido
   *               ou se interview_response já não é 'pending'.
   *
   * Retorna true se processou ou pulou (WJA encontrada), false se não encontrou WJA.
   */
  async processQualifiedInterviewReminder(
    workerId: string,
    jobPostingId: string,
  ): Promise<boolean> {
    const appResult = await this.db.query(
      `SELECT interview_response, interview_reminder_sent_at,
              interview_datetime, interview_meet_link
       FROM worker_job_applications
       WHERE worker_id = $1 AND job_posting_id = $2
       LIMIT 1`,
      [workerId, jobPostingId],
    );

    if (appResult.rows.length === 0) return false;

    const app = appResult.rows[0];

    // Idempotência: já enviou ou worker já respondeu
    if (app.interview_reminder_sent_at || app.interview_response !== 'pending') {
      return true;
    }

    if (!app.interview_datetime) return true;

    // Tokenizar nome e inserir na outbox
    let nameValue = workerId;
    if (this.tokenService) {
      nameValue = await this.tokenService.generate(workerId, 'worker_first_name');
    }

    const date = formatDateUTC(app.interview_datetime);
    const time = formatTimeUTC(app.interview_datetime);

    const outboxResult = await this.db.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
       VALUES ($1, 'qualified_reminder_confirm', $2::jsonb, 'pending', 0)
       RETURNING id`,
      [
        workerId,
        JSON.stringify({ name: nameValue, date, time, job_posting_id: jobPostingId }),
      ],
    );

    // Publicar no Pub/Sub para processamento imediato
    if (this.pubsub) {
      const outboxId = outboxResult.rows[0].id;
      await this.pubsub.publish('outbox-enqueued', { outboxId });
    }

    // Marcar como enviado
    await this.db.query(
      `UPDATE worker_job_applications
       SET interview_reminder_sent_at = NOW(), updated_at = NOW()
       WHERE worker_id = $1 AND job_posting_id = $2`,
      [workerId, jobPostingId],
    );

    return true;
  }

  /**
   * Fluxo legado: reminder 24h para encuadres.
   */
  private async processEncuadreReminder(workerId: string): Promise<void> {
    const result = await this.db.query(
      `SELECT e.id as encuadre_id, e.worker_id,
              is2.slot_date, is2.slot_time, is2.meet_link
       FROM encuadres e
       JOIN interview_slots is2 ON is2.id = e.interview_slot_id
       WHERE e.worker_id = $1
         AND e.interview_slot_id IS NOT NULL
         AND e.reminder_day_sent_at IS NULL
         AND is2.status != 'CANCELLED'
       LIMIT 1`,
      [workerId],
    );

    if (result.rows.length === 0) return;

    const row = result.rows[0];
    const dateFormatted = new Date(row.slot_date).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
    });

    await this.db.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
       VALUES ($1, 'encuadre_reminder_day_before', $2::jsonb, 'pending', 0)`,
      [
        row.worker_id,
        JSON.stringify({
          name: row.worker_id,
          date: dateFormatted,
          time: row.slot_time?.slice(0, 5) ?? '',
          meet_link: row.meet_link ?? '',
        }),
      ],
    );

    await this.db.query(
      `UPDATE encuadres SET reminder_day_sent_at = NOW() WHERE id = $1`,
      [row.encuadre_id],
    );
  }

  /**
   * Processa um lembrete de 5min antes para um worker específico.
   * Chamado via Cloud Task → POST /api/internal/reminders/5min
   */
  async process5MinReminder(workerId: string, jobPostingId: string): Promise<void> {
    const result = await this.db.query(
      `SELECT e.id as encuadre_id, e.worker_id,
              is2.slot_date, is2.slot_time, is2.meet_link
       FROM encuadres e
       JOIN interview_slots is2 ON is2.id = e.interview_slot_id
       WHERE e.worker_id = $1
         AND e.interview_slot_id IS NOT NULL
         AND e.reminder_5min_sent_at IS NULL
         AND is2.status != 'CANCELLED'
       LIMIT 1`,
      [workerId],
    );

    if (result.rows.length === 0) return;

    const row = result.rows[0];

    await this.db.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
       VALUES ($1, 'encuadre_reminder_5min', $2::jsonb, 'pending', 0)`,
      [
        row.worker_id,
        JSON.stringify({
          name: row.worker_id,
          meet_link: row.meet_link ?? '',
        }),
      ],
    );

    await this.db.query(
      `UPDATE encuadres SET reminder_5min_sent_at = NOW() WHERE id = $1`,
      [row.encuadre_id],
    );
  }

  /**
   * Safety net: processa todos os lembretes pendentes em batch.
   * Chamado via Cloud Scheduler como fallback para Cloud Tasks que falharam.
   */
  async processBatch(): Promise<void> {
    const dayCount = await this.sendDayBeforeReminders();
    const minCount = await this.send5MinReminders();
    if (dayCount + minCount > 0) {
      console.log(
        `[ReminderScheduler] 24h: ${dayCount} lembretes | 5min: ${minCount} lembretes`,
      );
    }
  }

  private async sendDayBeforeReminders(): Promise<number> {
    const result = await this.db.query(`
      SELECT e.id as encuadre_id, e.worker_id,
             is2.slot_date, is2.slot_time, is2.meet_link
      FROM encuadres e
      JOIN interview_slots is2 ON is2.id = e.interview_slot_id
      WHERE e.interview_slot_id IS NOT NULL
        AND e.reminder_day_sent_at IS NULL
        AND e.worker_id IS NOT NULL
        AND is2.status != 'CANCELLED'
        AND (is2.slot_date + is2.slot_time)::timestamptz - INTERVAL '24 hours' <= NOW()
        AND (is2.slot_date + is2.slot_time)::timestamptz > NOW()
    `);

    for (const row of result.rows) {
      const dateFormatted = new Date(row.slot_date).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
      });

      await this.db.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
         VALUES ($1, 'encuadre_reminder_day_before', $2::jsonb, 'pending', 0)`,
        [
          row.worker_id,
          JSON.stringify({
            name: row.worker_id,
            date: dateFormatted,
            time: row.slot_time?.slice(0, 5) ?? '',
            meet_link: row.meet_link ?? '',
          }),
        ],
      );

      await this.db.query(
        `UPDATE encuadres SET reminder_day_sent_at = NOW() WHERE id = $1`,
        [row.encuadre_id],
      );
    }

    return result.rows.length;
  }

  private async send5MinReminders(): Promise<number> {
    const result = await this.db.query(`
      SELECT e.id as encuadre_id, e.worker_id,
             is2.slot_date, is2.slot_time, is2.meet_link
      FROM encuadres e
      JOIN interview_slots is2 ON is2.id = e.interview_slot_id
      WHERE e.interview_slot_id IS NOT NULL
        AND e.reminder_5min_sent_at IS NULL
        AND e.worker_id IS NOT NULL
        AND is2.status != 'CANCELLED'
        AND (is2.slot_date + is2.slot_time)::timestamptz - INTERVAL '5 minutes' <= NOW()
        AND (is2.slot_date + is2.slot_time)::timestamptz > NOW()
    `);

    for (const row of result.rows) {
      await this.db.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
         VALUES ($1, 'encuadre_reminder_5min', $2::jsonb, 'pending', 0)`,
        [
          row.worker_id,
          JSON.stringify({
            name: row.worker_id,
            meet_link: row.meet_link ?? '',
          }),
        ],
      );

      await this.db.query(
        `UPDATE encuadres SET reminder_5min_sent_at = NOW() WHERE id = $1`,
        [row.encuadre_id],
      );
    }

    return result.rows.length;
  }
}
