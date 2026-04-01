-- Migration 103: Extend application_funnel_stage with post-prescreening states
--
-- Adds CONFIRMED, SELECTED, REJECTED so application_funnel_stage becomes
-- the single source of truth for Kanban column placement.
--
-- Full funnel:
--   INITIATED → IN_PROGRESS → COMPLETED → QUALIFIED/IN_DOUBT/NOT_QUALIFIED
--   → CONFIRMED → SELECTED / REJECTED
--   (PLACED kept for backward compat)

ALTER TABLE worker_job_applications
  DROP CONSTRAINT IF EXISTS worker_job_applications_application_funnel_stage_check;

ALTER TABLE worker_job_applications
  ADD CONSTRAINT worker_job_applications_application_funnel_stage_check
  CHECK (application_funnel_stage IN (
    'INITIATED',
    'IN_PROGRESS',
    'COMPLETED',
    'QUALIFIED',
    'IN_DOUBT',
    'NOT_QUALIFIED',
    'CONFIRMED',
    'SELECTED',
    'REJECTED',
    'PLACED'
  ));

-- Migrate existing encuadre-driven data to new stages:
-- resultado = SELECCIONADO/REEMPLAZO → SELECTED (if currently in a pre-selection stage)
UPDATE worker_job_applications wja
SET application_funnel_stage = 'SELECTED'
FROM encuadres e
WHERE e.worker_id = wja.worker_id
  AND e.job_posting_id = wja.job_posting_id
  AND e.resultado IN ('SELECCIONADO', 'REEMPLAZO')
  AND wja.application_funnel_stage NOT IN ('SELECTED', 'PLACED');

-- resultado = RECHAZADO/AT_NO_ACEPTA/BLACKLIST → REJECTED
UPDATE worker_job_applications wja
SET application_funnel_stage = 'REJECTED'
FROM encuadres e
WHERE e.worker_id = wja.worker_id
  AND e.job_posting_id = wja.job_posting_id
  AND e.resultado IN ('RECHAZADO', 'AT_NO_ACEPTA', 'BLACKLIST')
  AND wja.application_funnel_stage NOT IN ('REJECTED');

DO $$ BEGIN
  RAISE NOTICE 'Migration 103 done: application_funnel_stage extended with CONFIRMED, SELECTED, REJECTED.';
END $$;
