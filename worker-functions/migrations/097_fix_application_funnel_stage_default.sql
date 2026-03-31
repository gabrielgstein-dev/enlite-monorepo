-- Migration 097: Fix application_funnel_stage DEFAULT after migration 096
-- Migration 096 updated the CHECK constraint but left DEFAULT = 'APPLIED'
-- which is now invalid. Update DEFAULT to 'INITIATED'.

ALTER TABLE worker_job_applications
  ALTER COLUMN application_funnel_stage SET DEFAULT 'INITIATED';

DO $$ BEGIN
  RAISE NOTICE 'Migration 097 done: application_funnel_stage DEFAULT updated to INITIATED.';
END $$;
