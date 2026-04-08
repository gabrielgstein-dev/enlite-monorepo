--- Migration 117: Add TALENTUM_NOT_QUALIFIED to rejection_reason_category CHECK constraint
---
--- The ProcessTalentumPrescreening use case sets rejection_reason_category = 'TALENTUM_NOT_QUALIFIED'
--- when a candidate is analyzed as NOT_QUALIFIED by Talentum, but this value was missing from
--- the CHECK constraint added in migration 094, causing 500 errors on the webhook.

-- Step 1: Rename old constraint following deprecation pattern
ALTER TABLE encuadres RENAME CONSTRAINT encuadres_rejection_reason_category_check
  TO encuadres_rejection_reason_category_check_deprecated_20260407;

-- Step 2: Drop the deprecated constraint (safe — replaced by expanded version below)
ALTER TABLE encuadres DROP CONSTRAINT encuadres_rejection_reason_category_check_deprecated_20260407;

-- Step 3: Add new constraint with TALENTUM_NOT_QUALIFIED included
ALTER TABLE encuadres ADD CONSTRAINT encuadres_rejection_reason_category_check
  CHECK (rejection_reason_category IN (
    'DISTANCE', 'SCHEDULE_INCOMPATIBLE', 'INSUFFICIENT_EXPERIENCE',
    'SALARY_EXPECTATION', 'WORKER_DECLINED', 'OVERQUALIFIED',
    'DEPENDENCY_MISMATCH', 'TALENTUM_NOT_QUALIFIED', 'OTHER'
  ));

DO $$ BEGIN
  RAISE NOTICE 'Migration 117 complete: added TALENTUM_NOT_QUALIFIED to rejection_reason_category CHECK';
END $$;
