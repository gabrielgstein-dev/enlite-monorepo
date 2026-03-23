-- 040_consolidate_clickup_columns.sql
--
-- Elimina os prefixos "clickup_*" de job_postings, consolidando tudo em
-- colunas nativas sem duplicação.
--
-- Mapeamento:
--   clickup_task_id      → source_id         (RENAME)
--   clickup_task_name    → title              (data-migrate → DROP)
--   clickup_status       → status             (data-migrate → DROP)
--   clickup_priority     → priority           (data-migrate → DROP)
--   clickup_date_created → source_created_at  (RENAME)
--   clickup_date_updated → source_updated_at  (RENAME)
--   clickup_date_due     → due_date           (RENAME)
--   last_clickup_comment → last_comment       (RENAME)
--   clickup_comment_count→ comment_count      (RENAME)
--   clickup_assignee     → assignee           (RENAME)
--   clickup_task_content → description        (data-migrate → DROP)
--   dependency           → DROP  (vive em patients.dependency_level)
--   patient_name         → DROP  (vive em patients)

-- ── 1. Simples RENAMEs ────────────────────────────────────────────────────────
ALTER TABLE job_postings
  RENAME COLUMN clickup_task_id       TO source_id;

ALTER TABLE job_postings
  RENAME COLUMN clickup_date_created  TO source_created_at;

ALTER TABLE job_postings
  RENAME COLUMN clickup_date_updated  TO source_updated_at;

ALTER TABLE job_postings
  RENAME COLUMN clickup_date_due      TO due_date;

ALTER TABLE job_postings
  RENAME COLUMN last_clickup_comment  TO last_comment;

ALTER TABLE job_postings
  RENAME COLUMN clickup_comment_count TO comment_count;

ALTER TABLE job_postings
  RENAME COLUMN clickup_assignee      TO assignee;

-- ── 2. Migração de dados: clickup_status → status ────────────────────────────
-- Dropa constraint antiga (permitia apenas 'draft','active','paused','closed','filled').
-- O status agora vem diretamente do ClickUp com os valores reais.
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS valid_job_status;

UPDATE job_postings
  SET status = clickup_status
  WHERE clickup_status IS NOT NULL;

ALTER TABLE job_postings DROP COLUMN IF EXISTS clickup_status;

-- ── 3. Migração de dados: clickup_priority → priority ────────────────────────
-- Dropa constraint antiga ('URGENTE'/'NORMAL') — ClickUp usa 'urgent','high','normal','low'.
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_priority_check;

UPDATE job_postings
  SET priority = clickup_priority
  WHERE clickup_priority IS NOT NULL;

ALTER TABLE job_postings DROP COLUMN IF EXISTS clickup_priority;

-- Dropa também o constraint de dependency antes de dropar a coluna
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_dependency_check;

-- ── 4. Migração de dados: clickup_task_name → title ──────────────────────────
-- Usa clickup_task_name quando disponível; preserva título existente caso contrário.
UPDATE job_postings
  SET title = clickup_task_name
  WHERE clickup_task_name IS NOT NULL;

ALTER TABLE job_postings DROP COLUMN IF EXISTS clickup_task_name;

-- ── 5. Migração de dados: clickup_task_content → description ─────────────────
UPDATE job_postings
  SET description = clickup_task_content
  WHERE clickup_task_content IS NOT NULL;

ALTER TABLE job_postings DROP COLUMN IF EXISTS clickup_task_content;

-- ── 6. DROP de colunas que vivem em patients ──────────────────────────────────
ALTER TABLE job_postings DROP COLUMN IF EXISTS dependency;
ALTER TABLE job_postings DROP COLUMN IF EXISTS patient_name;

-- ── 7. Atualizar índice no source_id (renomeado de clickup_task_id) ───────────
-- O índice antigo provavelmente foi renomeado automaticamente pelo PostgreSQL,
-- mas recriamos com nome limpo para garantir.
DROP INDEX IF EXISTS idx_job_postings_clickup_task_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_source_id
  ON job_postings (source_id)
  WHERE source_id IS NOT NULL;
