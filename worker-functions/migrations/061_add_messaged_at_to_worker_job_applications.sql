-- Migration 061: Add messaged_at to worker_job_applications
--
-- Rastreia quando o admin enviou WhatsApp vacancy_match para um worker
-- nesta vaga específica. Permite exibir badge "Já notificado DD/MM" no frontend
-- e disparar confirmação antes de reenvio acidental.

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS messaged_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN worker_job_applications.messaged_at IS
  'Última vez que enviamos WhatsApp vacancy_match para este worker nesta vaga.
   NULL = nunca enviado. Atualizado pelo MessagingController após envio bem-sucedido.';

CREATE INDEX IF NOT EXISTS idx_wja_messaged_at
  ON worker_job_applications(messaged_at)
  WHERE messaged_at IS NOT NULL;
