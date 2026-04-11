-- Migration 130: Add acquisition_channel column to worker_job_applications
--
-- acquisition_channel tracks the social media channel through which the worker
-- arrived at the vacancy (facebook, instagram, whatsapp, linkedin, site).
-- Kept separate from `source` (which is a technical origin: manual/talentum/talent_search).

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(30);

COMMENT ON COLUMN worker_job_applications.acquisition_channel
  IS 'Canal social por onde o worker chegou a vaga (facebook, instagram, whatsapp, linkedin, site)';
