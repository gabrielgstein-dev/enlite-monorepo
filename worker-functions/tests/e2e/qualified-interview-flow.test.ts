/**
 * qualified-interview-flow.test.ts
 *
 * E2E do fluxo completo Qualified → Entrevista (Steps 4-8 do roadmap).
 *
 * Cenários:
 *   1. Happy path: qualified event �� invite → worker escolhe slot → reminder → confirm
 *   2. Decline: worker recebe reminder → declina → slot liberado + admin notificado
 *   3. State machine: transições inválidas são bloqueadas
 *
 * O ambiente E2E roda com:
 *   - USE_MOCK_AUTH=true (sem Firebase)
 *   - USE_MOCK_GOOGLE_CALENDAR=true (sem Google Calendar real)
 *   - Sem GCP_PROJECT_ID (PubSubClient e CloudTasksClient em mock mode)
 *   - Sem TWILIO_INBOUND_WEBHOOK_URL (signature validation skipped)
 */

import { Pool } from 'pg';
import axios from 'axios';
import { createApiClient, waitForBackend } from './helpers';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';
const INTERNAL_SECRET = process.env.INTERNAL_TOKEN_SECRET || 'test-secret-for-e2e-only';

const internalApi = axios.create({
  baseURL: `${API_URL}/api/internal`,
  headers: { 'X-Internal-Secret': INTERNAL_SECRET },
});

const WORKER_PHONE = '+5491199770001';
const WORKER_EMAIL = 'qualified-flow-e2e@test.local';
const MEET_LINK_1 = 'https://meet.google.com/flow-e2e-slot1';
const MEET_LINK_2 = 'https://meet.google.com/flow-e2e-slot2';
const FUTURE_DT_1 = '2099-08-10T10:00:00Z';
const FUTURE_DT_2 = '2099-08-10T14:00:00Z';

describe('Qualified Interview Flow — Full E2E (Steps 4-8)', () => {
  const api = createApiClient();
  let pool: Pool;
  let workerId: string;
  let jobPostingId: string;
  let inviteSid: string;
  let reminderSid: string;

  beforeAll(async () => {
    await waitForBackend(api);
    pool = new Pool({ connectionString: DATABASE_URL });

    // ── Seed data ─────────────────────────────────────────────────────

    // Worker
    const wRes = await pool.query(
      `INSERT INTO workers (auth_uid, email, phone, status, created_at, updated_at)
       VALUES ('flow-e2e-uid', $1, $2, 'REGISTERED', NOW(), NOW())
       ON CONFLICT (auth_uid) DO UPDATE SET email = EXCLUDED.email, phone = EXCLUDED.phone
       RETURNING id`,
      [WORKER_EMAIL, WORKER_PHONE],
    );
    workerId = wRes.rows[0].id;

    // Job posting com 2 meet links
    const jpRes = await pool.query(
      `INSERT INTO job_postings (
         case_number, title,
         meet_link_1, meet_datetime_1,
         meet_link_2, meet_datetime_2,
         created_at, updated_at
       ) VALUES (99902, 'Vaga Flow E2E', $1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [MEET_LINK_1, FUTURE_DT_1, MEET_LINK_2, FUTURE_DT_2],
    );
    jobPostingId = jpRes.rows[0].id;

    // Templates
    await pool.query(`
      INSERT INTO message_templates (slug, name, body, is_active, created_at, updated_at) VALUES
        ('qualified_worker', 'Worker Qualificado', '{{slot_1}}{{link_1}}{{slot_2}}{{link_2}}{{slot_3}}{{link_3}}{{case_number}}', true, NOW(), NOW()),
        ('qualified_interview_invite', 'Invitación Entrevista', 'Elija: {{option_1}} {{option_2}} {{option_3}}', true, NOW(), NOW()),
        ('qualified_slot_confirmed', 'Entrevista Agendada', 'Agendada: {{date}} {{time}} {{meet_link}}', true, NOW(), NOW()),
        ('qualified_reminder_confirm', 'Confirmación 24h', 'Mañana {{date}} a las {{time}}. ¿Confirma?', true, NOW(), NOW()),
        ('qualified_declined_admin', 'Worker declinó', 'Worker {{name}} declinó.', true, NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING
    `);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM messaging_outbox WHERE worker_id = $1', [workerId]);
    await pool.query('DELETE FROM domain_events WHERE payload @> $1::jsonb', [
      JSON.stringify({ workerId }),
    ]);
    await pool.query('DELETE FROM worker_job_applications WHERE worker_id = $1', [workerId]);
    await pool.query('DELETE FROM job_postings WHERE id = $1', [jobPostingId]);
    await pool.query('DELETE FROM workers WHERE id = $1', [workerId]);
    await pool.end();
  });

  // ─── Step 4: Emit domain event on QUALIFIED ────────────────────────

  describe('Step 4 �� Domain event emitted on QUALIFIED', () => {
    it('inserting QUALIFIED application creates domain_event', async () => {
      // Simula o que ProcessTalentumPrescreening faz:
      // INSERT application + INSERT domain_event na mesma transação
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage, interview_response, created_at, updated_at)
           VALUES ($1, $2, 'QUALIFIED', 'pending', NOW(), NOW())
           ON CONFLICT (worker_id, job_posting_id) DO UPDATE
             SET application_funnel_stage = 'QUALIFIED', interview_response = 'pending',
                 interview_meet_link = NULL, interview_datetime = NULL, updated_at = NOW()`,
          [workerId, jobPostingId],
        );

        const evtRes = await client.query(
          `INSERT INTO domain_events (event, payload, status)
           VALUES ('funnel_stage.qualified', $1::jsonb, 'pending')
           RETURNING id`,
          [JSON.stringify({ workerId, jobPostingId })],
        );

        await client.query('COMMIT');

        const eventId = evtRes.rows[0].id;
        expect(eventId).toBeDefined();

        // Verify event in DB
        const { rows } = await pool.query(
          `SELECT event, status FROM domain_events WHERE id = $1`,
          [eventId],
        );
        expect(rows[0].event).toBe('funnel_stage.qualified');
        expect(rows[0].status).toBe('pending');
      } finally {
        client.release();
      }
    });
  });

  // ─── Step 7: Worker selects slot via WhatsApp ──────────────────────

  describe('Step 7 — BookSlot via WhatsApp button', () => {
    beforeAll(async () => {
      // Simular que o QualifiedInterviewHandler enfileirou a invite na outbox
      inviteSid = 'SM_FLOW_INVITE_' + Date.now();
      await pool.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, twilio_sid, attempts)
         VALUES ($1, 'qualified_worker', $2::jsonb, 'sent', $3, 1)`,
        [
          workerId,
          JSON.stringify({ job_posting_id: jobPostingId }),
          inviteSid,
        ],
      );
    });

    it('worker taps slot_1 → booking confirmed', async () => {
      const res = await api.post('/api/webhooks/twilio/inbound', new URLSearchParams({
        From: `whatsapp:${WORKER_PHONE}`,
        ButtonPayload: 'slot_1',
        OriginalRepliedMessageSid: inviteSid,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      expect(res.status).toBe(200);

      // Verify application updated with meet link
      const { rows } = await pool.query(
        `SELECT interview_meet_link, interview_datetime, interview_response
         FROM worker_job_applications
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [workerId, jobPostingId],
      );
      expect(rows[0].interview_meet_link).toBe(MEET_LINK_1);
      expect(rows[0].interview_datetime).not.toBeNull();
    });

    it('confirmation message enqueued in outbox', async () => {
      const { rows } = await pool.query(
        `SELECT template_slug, variables
         FROM messaging_outbox
         WHERE worker_id = $1 AND template_slug = 'qualified_slot_confirmed'
         ORDER BY created_at DESC LIMIT 1`,
        [workerId],
      );
      expect(rows).toHaveLength(1);
      const vars = rows[0].variables;
      expect(vars.meet_link).toBe(MEET_LINK_1);
    });
  });

  // ─── Step 8a: Reminder endpoint ────────────────────────────────────

  describe('Step 8a — Reminder de confirmação', () => {
    it('reminder endpoint processes successfully', async () => {
      const res = await internalApi.post('/reminders/qualified', {
        workerId,
        jobPostingId,
      });
      expect(res.status).toBe(200);
    });

    it('reminder is idempotent (second call skips)', async () => {
      const res = await internalApi.post('/reminders/qualified', {
        workerId,
        jobPostingId,
      });
      expect(res.status).toBe(200);
    });
  });

  // ─── Step 8b: Worker confirms ──────────────────────────────────────

  describe('Step 8b — Worker confirms interview', () => {
    beforeAll(async () => {
      // Simular outbox do reminder com twilio_sid para correlação
      reminderSid = 'SM_FLOW_REMINDER_' + Date.now();
      await pool.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, twilio_sid, attempts)
         VALUES ($1, 'qualified_reminder_confirm', $2::jsonb, 'sent', $3, 1)`,
        [
          workerId,
          JSON.stringify({ job_posting_id: jobPostingId }),
          reminderSid,
        ],
      );
    });

    it('confirm_yes → interview_response = confirmed', async () => {
      const res = await api.post('/api/webhooks/twilio/inbound', new URLSearchParams({
        From: `whatsapp:${WORKER_PHONE}`,
        ButtonPayload: 'confirm_yes',
        OriginalRepliedMessageSid: reminderSid,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      expect(res.status).toBe(200);

      const { rows } = await pool.query(
        `SELECT interview_response, interview_responded_at
         FROM worker_job_applications
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [workerId, jobPostingId],
      );
      expect(rows[0].interview_response).toBe('confirmed');
      expect(rows[0].interview_responded_at).not.toBeNull();
    });
  });

  // ─── Step 8c: Decline flow (separate application) ──────────────────

  describe('Step 8c — Worker declines interview', () => {
    let declineJobId: string;
    let declineInviteSid: string;
    let declineReminderSid: string;

    beforeAll(async () => {
      // Criar outra vaga para testar declínio isolado
      const jpRes = await pool.query(
        `INSERT INTO job_postings (case_number, title, meet_link_1, meet_datetime_1, created_at, updated_at)
         VALUES (99903, 'Vaga Decline E2E', $1, $2, NOW(), NOW())
         RETURNING id`,
        [MEET_LINK_2, FUTURE_DT_2],
      );
      declineJobId = jpRes.rows[0].id;

      // Criar application
      await pool.query(
        `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage, interview_response, created_at, updated_at)
         VALUES ($1, $2, 'QUALIFIED', 'pending', NOW(), NOW())
         ON CONFLICT (worker_id, job_posting_id) DO UPDATE
           SET interview_response = 'pending', interview_meet_link = NULL, updated_at = NOW()`,
        [workerId, declineJobId],
      );

      // Simular invite + booking
      declineInviteSid = 'SM_DECLINE_INVITE_' + Date.now();
      await pool.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, twilio_sid, attempts)
         VALUES ($1, 'qualified_worker', $2::jsonb, 'sent', $3, 1)`,
        [workerId, JSON.stringify({ job_posting_id: declineJobId }), declineInviteSid],
      );

      // Worker escolhe slot
      await api.post('/api/webhooks/twilio/inbound', new URLSearchParams({
        From: `whatsapp:${WORKER_PHONE}`,
        ButtonPayload: 'slot_1',
        OriginalRepliedMessageSid: declineInviteSid,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // Simular reminder outbox
      declineReminderSid = 'SM_DECLINE_REMINDER_' + Date.now();
      await pool.query(
        `INSERT INTO messaging_outbox (worker_id, template_slug, variables, status, twilio_sid, attempts)
         VALUES ($1, 'qualified_reminder_confirm', $2::jsonb, 'sent', $3, 1)`,
        [workerId, JSON.stringify({ job_posting_id: declineJobId }), declineReminderSid],
      );
    });

    afterAll(async () => {
      await pool.query('DELETE FROM messaging_outbox WHERE worker_id = $1 AND variables @> $2::jsonb', [
        workerId, JSON.stringify({ job_posting_id: declineJobId }),
      ]);
      await pool.query('DELETE FROM worker_job_applications WHERE worker_id = $1 AND job_posting_id = $2', [
        workerId, declineJobId,
      ]);
      await pool.query('DELETE FROM job_postings WHERE id = $1', [declineJobId]);
    });

    it('confirm_no → interview_response = declined', async () => {
      const res = await api.post('/api/webhooks/twilio/inbound', new URLSearchParams({
        From: `whatsapp:${WORKER_PHONE}`,
        ButtonPayload: 'confirm_no',
        OriginalRepliedMessageSid: declineReminderSid,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      expect(res.status).toBe(200);

      const { rows } = await pool.query(
        `SELECT interview_response, interview_responded_at, interview_meet_link, interview_datetime
         FROM worker_job_applications
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [workerId, declineJobId],
      );
      expect(rows[0].interview_response).toBe('declined');
      expect(rows[0].interview_responded_at).not.toBeNull();
      // Slot data cleared
      expect(rows[0].interview_meet_link).toBeNull();
      expect(rows[0].interview_datetime).toBeNull();
    });

    it('admin notification enqueued after decline', async () => {
      const { rows } = await pool.query(
        `SELECT template_slug
         FROM messaging_outbox
         WHERE worker_id = $1 AND template_slug = 'qualified_declined_admin'
         ORDER BY created_at DESC LIMIT 1`,
        [workerId],
      );
      expect(rows).toHaveLength(1);
    });

    it('declined → confirmed is blocked (state machine)', async () => {
      // Tentar confirmar após ter declinado — deve ser ignorado
      const res = await api.post('/api/webhooks/twilio/inbound', new URLSearchParams({
        From: `whatsapp:${WORKER_PHONE}`,
        ButtonPayload: 'confirm_yes',
        OriginalRepliedMessageSid: declineReminderSid,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // Returns 200 (Twilio contract) but state doesn't change
      expect(res.status).toBe(200);

      const { rows } = await pool.query(
        `SELECT interview_response
         FROM worker_job_applications
         WHERE worker_id = $1 AND job_posting_id = $2`,
        [workerId, declineJobId],
      );
      expect(rows[0].interview_response).toBe('declined');
    });
  });
});
