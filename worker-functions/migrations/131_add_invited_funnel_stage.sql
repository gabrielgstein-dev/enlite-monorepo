-- Migration 131: Add INVITED to application_funnel_stage CHECK constraint
--
-- Workers arriving via social short links need an explicit INVITED stage
-- instead of relying on NULL (which defaults to INITIATED via migration 097).
-- DROP CONSTRAINT is required to add new values to a CHECK constraint.

ALTER TABLE worker_job_applications
  DROP CONSTRAINT IF EXISTS worker_job_applications_application_funnel_stage_check;

ALTER TABLE worker_job_applications
  ADD CONSTRAINT worker_job_applications_application_funnel_stage_check
  CHECK (application_funnel_stage IN (
    'INVITED',
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

DO $$ BEGIN
  RAISE NOTICE 'Migration 131 done: INVITED added to application_funnel_stage CHECK.';
END $$;
