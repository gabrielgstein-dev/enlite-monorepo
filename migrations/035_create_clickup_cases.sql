-- Migration 035: Enriquecer job_postings com campos do ClickUp
--
-- NÃO cria uma tabela separada. job_postings já é a fonte de verdade de vacantes.
-- O import do ClickUp INCREMENTA esses campos via UPSERT por case_number.

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS clickup_task_id         TEXT,
  ADD COLUMN IF NOT EXISTS clickup_task_name        TEXT,
  ADD COLUMN IF NOT EXISTS clickup_status           TEXT,          -- BUSQUEDA, REEMPLAZO, etc.
  ADD COLUMN IF NOT EXISTS clickup_priority         TEXT,          -- URGENT, HIGH, NORMAL, LOW
  ADD COLUMN IF NOT EXISTS diagnosis                TEXT,
  ADD COLUMN IF NOT EXISTS patient_zone             TEXT,
  ADD COLUMN IF NOT EXISTS patient_neighborhood     TEXT,
  ADD COLUMN IF NOT EXISTS worker_profile_sought    TEXT,
  ADD COLUMN IF NOT EXISTS schedule_days_hours      TEXT,
  ADD COLUMN IF NOT EXISTS clickup_date_created     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clickup_date_updated     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clickup_date_due         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_start_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_clickup_comment     TEXT;

-- Índices de busca por zona e status ClickUp
CREATE INDEX IF NOT EXISTS idx_job_postings_patient_zone    ON job_postings(patient_zone)    WHERE patient_zone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_postings_clickup_status  ON job_postings(clickup_status)  WHERE clickup_status IS NOT NULL;
