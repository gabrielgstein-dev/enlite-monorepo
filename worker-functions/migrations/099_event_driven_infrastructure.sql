-- ══════════════════════════════════════════════════════════════
-- Migration 099: Infraestrutura event-driven + tracking entrevista QUALIFIED
-- Step 2 do roadmap Qualified Interview Flow
-- ══════════════════════════════════════════════════════════════

-- ── 1. Tabela domain_events (Transactional Outbox para eventos de domínio) ──

CREATE TABLE IF NOT EXISTS domain_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event        TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domain_events_pending
  ON domain_events (created_at)
  WHERE status = 'pending';

-- ── 2. Colunas de tracking de entrevista em worker_job_applications ──

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS interview_meet_link        TEXT,
  ADD COLUMN IF NOT EXISTS interview_datetime         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_response         TEXT
    CHECK (interview_response IN ('pending', 'confirmed', 'declined', 'no_response')),
  ADD COLUMN IF NOT EXISTS interview_responded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_slot_id          UUID REFERENCES interview_slots(id);

CREATE INDEX IF NOT EXISTS idx_wja_interview_pending
  ON worker_job_applications (interview_datetime)
  WHERE interview_response = 'pending'
    AND interview_datetime IS NOT NULL;

-- ── 3. Templates de mensagem para fluxo QUALIFIED ──

INSERT INTO message_templates (slug, name, body, category, content_sid) VALUES
  ('qualified_interview_invite',
   'Invitación Entrevista Qualified',
   'Hola {{name}}! Felicitaciones, fue preseleccionado/a para una entrevista. Elija el horario que le quede mejor: 1) {{option_1}} 2) {{option_2}} 3) {{option_3}}',
   'recruitment', NULL),
  ('qualified_slot_confirmed',
   'Entrevista Agendada',
   'Hola {{name}}! Su entrevista fue agendada para el {{date}} a las {{time}}. Enlace: {{meet_link}}. ¡Lo esperamos!',
   'recruitment', NULL),
  ('qualified_reminder_confirm',
   'Confirmación 24h antes',
   'Hola {{name}}! Mañana {{date}} a las {{time}} tiene su entrevista. ¿Confirma su asistencia?',
   'notification', NULL),
  ('qualified_declined_admin',
   'Worker declinó entrevista',
   'El worker {{name}} (ID: {{worker_id}}) declinó su entrevista del {{date}} a las {{time}} para la vaga {{vacancy_name}}. El slot fue liberado.',
   'internal', NULL)
ON CONFLICT (slug) DO NOTHING;
