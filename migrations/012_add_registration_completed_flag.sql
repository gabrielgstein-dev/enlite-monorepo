-- Migration 012: Add registration_completed flag to workers table
-- This flag tracks whether the user has completed the full worker registration flow
-- Users can now land on Home after signup, and complete registration later

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS registration_completed BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN workers.registration_completed IS 'Indicates if the worker has completed all registration steps (general info, service address, availability)';

-- Create index for quick filtering of incomplete registrations
CREATE INDEX IF NOT EXISTS idx_workers_registration_incomplete 
  ON workers(registration_completed) 
  WHERE registration_completed = FALSE;
