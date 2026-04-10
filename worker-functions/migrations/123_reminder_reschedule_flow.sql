-- Migration 123: Reminder reschedule/decline flow
--
-- Extends interview_response with intermediate states for the reminder flow:
--   confirmed → awaiting_reschedule (worker said No at reminder)
--   awaiting_reschedule → pending (REPROGRAM) or → awaiting_reason (doesn't want to reschedule)
--   awaiting_reason → declined (RECHAZADO, reason captured)
--
-- Adds REPROGRAM and RECHAZADO to application_funnel_stage.
-- Adds interview_decline_reason to store free-text reason.

-- ── STEP 1: Extend interview_response CHECK constraint ────────────────────────

ALTER TABLE worker_job_applications
  DROP CONSTRAINT IF EXISTS worker_job_applications_interview_response_check;

ALTER TABLE worker_job_applications
  ADD CONSTRAINT worker_job_applications_interview_response_check
  CHECK (interview_response IN (
    'pending',
    'confirmed',
    'declined',
    'awaiting_reschedule',
    'awaiting_reason',
    'no_response'
  ));

-- ── STEP 2: Extend application_funnel_stage CHECK constraint ──────────────────

ALTER TABLE worker_job_applications
  DROP CONSTRAINT IF EXISTS worker_job_applications_application_funnel_stage_check;

ALTER TABLE worker_job_applications
  ADD CONSTRAINT worker_job_applications_application_funnel_stage_check
  CHECK (application_funnel_stage IN (
    'INITIATED',
    'IN_PROGRESS',
    'COMPLETED',
    'QUALIFIED',
    'IN_DOUBT',
    'NOT_QUALIFIED',
    'CONFIRMED',
    'REPROGRAM',
    'RECHAZADO',
    'SELECTED',
    'REJECTED',
    'PLACED'
  ));

-- ── STEP 3: Add decline reason column ─────────────────────────────────────────

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS interview_decline_reason TEXT;

COMMENT ON COLUMN worker_job_applications.interview_decline_reason IS
  'Free-text reason provided by worker when declining interview (RECHAZADO flow)';

-- ── STEP 4: Register new templates ────────────────────────────────────────────

INSERT INTO message_templates (slug, name, category, body, content_sid, is_active)
VALUES
  ('qualified_reminder_reschedule',
   'Reagendar entrevista',
   'recruitment',
   'Entendemos. ¿Te gustaría reagendar tu entrevista para otro día? 📅',
   'HX40814510338a9568602dac39a2ef82df',
   true),
  ('qualified_reminder_reason',
   'Motivo de rechazo',
   'recruitment',
   'Lamentamos mucho. ¿Podrías contarnos brevemente por qué no podés participar? Tu respuesta nos ayuda a mejorar. 💛',
   'HX108cd59b4c4c052789b01b097d51febd',
   true)
ON CONFLICT (slug) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE 'Migration 123 done: interview_response extended, REPROGRAM/RECHAZADO added, decline reason column created, templates registered.';
END $$;
