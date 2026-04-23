import { Pool } from 'pg';
import { PubSubClient } from '../PubSubClient';
import { TokenService } from '../../../modules/notification/infrastructure/TokenService';

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
 *   1. Busca meet links + case_number da vaga (job_postings)
 *   2. Verifica que worker existe
 *   3. Formata as opções de horário
 *   4. Insere na messaging_outbox com template 'qualified_worker'
 *      Variáveis Twilio: {{1}}=slot_1 {{2}}=slot_2 {{3}}=slot_3 {{4}}=case_number
 *      Os meet_links não vão no template — BookSlotFromWhatsAppUseCase
 *      busca o link correto do job_postings quando o worker escolhe o slot.
 *   5. Publica no Pub/Sub para processamento imediato
 *   6. Marca interview_response = 'pending' em worker_job_applications
 */
export function createQualifiedInterviewHandler(
  db: Pool,
  pubsub: PubSubClient,
  _tokenService: TokenService,
): (payload: Record<string, unknown>) => Promise<void> {
  return async (payload) => {
    const workerId = payload.workerId as string;
    const jobPostingId = payload.jobPostingId as string;

    // 1. Buscar meet links + case_number da vaga
    const vacancyResult = await db.query(
      `SELECT case_number,
              meet_link_1, meet_datetime_1,
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

    // 3. Formatar opções de horário (ex: "Lun 07/04 10:00")
    // Variáveis mapeadas para posições do template Twilio qualified_worker:
    //   {{1}}=slot_1 {{2}}=slot_2 {{3}}=slot_3 {{4}}=case_number
    // meet_links não são enviados no template — o BookSlotFromWhatsAppUseCase
    // busca o link correto do job_postings quando o worker escolhe o slot.
    const outboxResult = await db.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, attempts)
       VALUES ($1, 'qualified_worker_request', $2::jsonb, 'pending', 0)
       RETURNING id`,
      [
        workerId,
        JSON.stringify({
          slot_1: vacancy.meet_datetime_1 ? formatSlotOption(vacancy.meet_datetime_1) : '',
          slot_2: vacancy.meet_datetime_2 ? formatSlotOption(vacancy.meet_datetime_2) : '',
          slot_3: vacancy.meet_datetime_3 ? formatSlotOption(vacancy.meet_datetime_3) : '',
          case_number: String(vacancy.case_number ?? ''),
          job_posting_id: jobPostingId,
        }),
      ],
    );

    const outboxId = outboxResult.rows[0].id;
    await pubsub.publish('outbox-enqueued', { outboxId });

    // 4. Marcar interview_response = 'pending'
    await db.query(
      `UPDATE worker_job_applications
       SET interview_response = 'pending', updated_at = NOW()
       WHERE worker_id = $1 AND job_posting_id = $2`,
      [workerId, jobPostingId],
    );

    console.log(
      `[QualifiedInterviewHandler] Queued qualified_worker worker=${workerId} job=${jobPostingId} case=${vacancy.case_number}`,
    );
  };
}
