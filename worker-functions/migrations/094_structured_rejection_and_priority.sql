-- Migration 094: Structured rejection reasons + priority normalization to EN
--
-- Adds rejection_reason_category as structured enum alongside free-text rejection_reason.
-- Normalizes priority to uppercase English: URGENT, HIGH, NORMAL, LOW.
-- Adds avg_quality_rating cache on workers (from worker_placement_audits).

-- 1. Normalize existing priority values to uppercase English
UPDATE job_postings SET priority = 'URGENT' WHERE priority IN ('URGENTE', 'urgent', 'Urgente');
UPDATE job_postings SET priority = 'HIGH'   WHERE priority IN ('ALTA', 'alta', 'high', 'Alta');
UPDATE job_postings SET priority = 'NORMAL' WHERE priority IN ('normal', 'Normal');
UPDATE job_postings SET priority = 'LOW'    WHERE priority IN ('BAJA', 'baja', 'low', 'Baja');

ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_priority_check;
ALTER TABLE job_postings ADD CONSTRAINT job_postings_priority_check
  CHECK (priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW'));

-- 2. Structured rejection reason (parallel to existing free-text rejection_reason)
ALTER TABLE encuadres ADD COLUMN IF NOT EXISTS
  rejection_reason_category VARCHAR(30) CHECK (rejection_reason_category IN (
    'DISTANCE', 'SCHEDULE_INCOMPATIBLE', 'INSUFFICIENT_EXPERIENCE',
    'SALARY_EXPECTATION', 'WORKER_DECLINED', 'OVERQUALIFIED',
    'DEPENDENCY_MISMATCH', 'OTHER'
  ));

-- 3. Cached average quality rating for workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS avg_quality_rating NUMERIC(3,2);

-- 4. Index for fast rejection history lookup per worker
CREATE INDEX IF NOT EXISTS idx_encuadres_rejection_category
  ON encuadres(worker_id, rejection_reason_category)
  WHERE rejection_reason_category IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE 'Migration 094 complete: rejection_reason_category + priority normalized to EN + avg_quality_rating';
END $$;
