import { Pool } from 'pg';
import { PubSubClient } from '../PubSubClient';
import { TokenService } from '../../services/TokenService';

/**
 * Formata um datetime ISO para opção de slot legível.
 * Ex: "2026-04-07T10:00:00Z" → "Lun 07/04 10:00"
 */
export function formatSlotOption(datetime: string | Date): string {
  const date = new Date(datetime);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const day = dayNames[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day} ${dd}/${mm} ${hh}:${min}`;
}

/**
 * Cria o handler para o evento `funnel_stage.qualified`.
 *
 * Quando um worker transita para QUALIFIED no Talentum:
 *   1. Busca meet links da vaga (job_postings)
 *   2. Tokeniza o nome do worker (PII)
 *   3. Formata as opções de horário
 *   4. Insere na messaging_outbox com template 'qualified_interview_invite'
 *   5. Publica no Pub/Sub para processamento imediato
 *   6. Marca interview_response = 'pending' em worker_job_applications
 */
export function createQualifiedInterviewHandler(
  db: Pool,
  pubsub: PubSubClient,
  tokenService: TokenService,
): (payload: Record<string, unknown>) => Promise<void> {
  return async (payload) => {
    const workerId = payload.workerId as string;
    const jobPostingId = payload.jobPostingId as string;

    // 1. Buscar meet links da vaga
    const vacancyResult = await db.query(
      `SELECT meet_link_1, meet_datetime_1,
              meet_link_2, meet_datetime_2,
              meet_link_3, meet_datetime_3
       FROM job_postings
       WHERE id = $1 AND deleted_at IS NULL`,
      [jobPostingId],
    );

    if (vacancyResult.rows.length === 0) {
      console.warn(`[QualifiedInterviewHandler] Job posting ${jobPostingId} not found`);
      return;
    }

    const vacancy = vacancyResult.rows[0];
    if (!vacancy.meet_link_1 || !vacancy.meet_datetime_1) {
      console.warn(
        `[QualifiedInterviewHandler] No meet links configured for job posting ${jobPostingId}`,
      );
      return;
    }

    // 2. Verificar que worker existe
    const workerResult = await db.query(
      `SELECT id FROM workers WHERE id = $1`,
      [workerId],
    );

    if (workerResult.rows.length === 0) {
      console.warn(`[QualifiedInterviewHandler] Worker ${workerId} not found`);
      return;
    }

    // 3. Tokenizar nome para proteção PII
    const nameToken = await tokenService.generate(workerId, 'worker_first_name');

    // 4. Formatar opções de horário (ex: "Lun 07/04 10:00")
    const options = [
      vacancy.meet_datetime_1 ? formatSlotOption(vacancy.meet_datetime_1) : null,
      vacancy.meet_datetime_2 ? formatSlotOption(vacancy.meet_datetime_2) : null,
      vacancy.meet_datetime_3 ? formatSlotOption(vacancy.meet_datetime_3) : null,
    ].filter(Boolean) as string[];

    // 5. Inserir na messaging_outbox + publicar Pub/Sub
    const outboxResult = await db.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
       VALUES ($1, 'qualified_interview_invite', $2::jsonb, 'pending', 0)
       RETURNING id`,
      [
        workerId,
        JSON.stringify({
          name: nameToken,
          option_1: options[0] ?? '',
          option_2: options[1] ?? '',
          option_3: options[2] ?? '',
          job_posting_id: jobPostingId,
        }),
      ],
    );

    const outboxId = outboxResult.rows[0].id;
    await pubsub.publish('outbox-enqueued', { outboxId });

    // 6. Marcar interview_response = 'pending'
    await db.query(
      `UPDATE worker_job_applications
       SET interview_response = 'pending', updated_at = NOW()
       WHERE worker_id = $1 AND job_posting_id = $2`,
      [workerId, jobPostingId],
    );

    console.log(
      `[QualifiedInterviewHandler] Queued interview invite worker=${workerId} job=${jobPostingId}`,
    );
  };
}
