-- ============================================================
-- Migration 019: Suporte ao import de Talent Search (CSV de ATS/CRM)
--
-- Adiciona:
--   • source em worker_job_applications — rastreio de origem da candidatura
--   • linkedin_url em workers — para candidatos importados via talent search
-- ============================================================

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

DO $$ BEGIN RAISE NOTICE 'Migration 019 concluída: source adicionado a worker_job_applications, linkedin_url adicionado a workers'; END $$;
