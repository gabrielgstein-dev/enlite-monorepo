-- Migration 100: Fix workers.status DEFAULT after migration 096
-- Migration 096 added the CHECK constraint but did not set a DEFAULT value.
-- Without a DEFAULT, INSERT without explicit status fails the constraint.
-- Fix: set DEFAULT = 'INCOMPLETE_REGISTER' (matches initial registration state).

ALTER TABLE workers
  ALTER COLUMN status SET DEFAULT 'INCOMPLETE_REGISTER';

DO $$ BEGIN
  RAISE NOTICE 'Migration 100 done: workers.status DEFAULT set to INCOMPLETE_REGISTER.';
END $$;
