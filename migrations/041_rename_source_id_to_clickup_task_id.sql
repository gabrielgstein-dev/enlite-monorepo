-- 041_rename_source_id_to_clickup_task_id.sql
--
-- Renomeia source_id de volta para clickup_task_id.
-- Essa coluna é o vínculo explícito entre o registro no nosso banco e
-- a task no ClickUp — o prefixo clickup_ é intencional e deve ser mantido.

ALTER TABLE job_postings RENAME COLUMN source_id TO clickup_task_id;

-- status não deve ter valor inventado — NULL significa "ainda não veio do ClickUp"
ALTER TABLE job_postings ALTER COLUMN status DROP NOT NULL;
UPDATE job_postings SET status = NULL WHERE status = 'active' AND clickup_task_id IS NULL;

DROP INDEX IF EXISTS idx_job_postings_source_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_clickup_task_id
  ON job_postings (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;
