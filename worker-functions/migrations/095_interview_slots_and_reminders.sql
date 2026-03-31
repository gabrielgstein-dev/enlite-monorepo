-- ====================================================================
-- Migration 095: Interview Slots + Reminder Tracking
-- Wave 2 — Agendamento de Entrevistas + Lembretes WhatsApp
-- ====================================================================

-- ====================================================================
-- 1. Tabela interview_slots
-- ====================================================================
CREATE TABLE IF NOT EXISTS interview_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id   UUID REFERENCES coordinators(id),
  job_posting_id   UUID NOT NULL REFERENCES job_postings(id),
  slot_date        DATE NOT NULL,
  slot_time        TIME NOT NULL,
  slot_end_time    TIME NOT NULL,
  meet_link        VARCHAR(500),
  max_capacity     INT NOT NULL DEFAULT 1,
  booked_count     INT NOT NULL DEFAULT 0,
  status           VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE', 'FULL', 'CANCELLED')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_booked_within_capacity CHECK (booked_count <= max_capacity),
  CONSTRAINT chk_slot_time_order CHECK (slot_time < slot_end_time)
);

CREATE INDEX IF NOT EXISTS idx_interview_slots_job_available
  ON interview_slots(job_posting_id, slot_date, status)
  WHERE status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS idx_interview_slots_coordinator_date
  ON interview_slots(coordinator_id, slot_date, slot_time);

-- Trigger: auto-update status quando booked_count muda
CREATE OR REPLACE FUNCTION fn_interview_slot_auto_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booked_count >= NEW.max_capacity AND NEW.status = 'AVAILABLE' THEN
    NEW.status := 'FULL';
  ELSIF NEW.booked_count < NEW.max_capacity AND NEW.status = 'FULL' THEN
    NEW.status := 'AVAILABLE';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_slot_auto_status ON interview_slots;
CREATE TRIGGER trg_interview_slot_auto_status
  BEFORE UPDATE OF booked_count ON interview_slots
  FOR EACH ROW EXECUTE FUNCTION fn_interview_slot_auto_status();

-- ====================================================================
-- 2. Colunas em encuadres
-- ====================================================================
ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS interview_slot_id UUID REFERENCES interview_slots(id);

ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS reminder_day_sent_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS reminder_5min_sent_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_encuadres_pending_reminders
  ON encuadres(interview_slot_id)
  WHERE interview_slot_id IS NOT NULL;

-- ====================================================================
-- 3. Seed de templates de mensagem
-- ====================================================================
INSERT INTO message_templates (slug, name, body, category) VALUES
  ('encuadre_invitation',
   'Invitación a Entrevista',
   'Hola {{name}}! Fue seleccionado/a para una entrevista de matching para el caso en {{location}}. La entrevista será el {{date}} a las {{time}} por el enlace: {{meet_link}}. Por favor confirme su disponibilidad respondiendo este mensaje.',
   'recruitment'),
  ('encuadre_reminder_day_before',
   'Recordatorio Entrevista (24h)',
   'Hola {{name}}! Le recordamos que mañana, {{date}}, a las {{time}}, tiene una entrevista de matching. Enlace: {{meet_link}}. ¡Nos vemos allí!',
   'notification'),
  ('encuadre_reminder_5min',
   'Recordatorio Entrevista (5min)',
   'Hola {{name}}! Su entrevista comienza en 5 minutos. Acceda por el enlace: {{meet_link}}. ¡Buena suerte!',
   'notification')
ON CONFLICT (slug) DO NOTHING;
