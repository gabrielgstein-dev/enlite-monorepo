-- ============================================================
-- Migration 080 — Wave 6 / N4 Fase 1
-- Remove dependency_level from job_postings (duplicate of patients.dependency_level)
-- ============================================================
-- dependency_level was added in migration 055 as a Planilla Operativa denormalization,
-- but patients.dependency_level already existed since migration 037.
-- All consuming code (VacanciesController, RecruitmentController) already reads
-- dependency_level via JOIN patients. This migration removes the duplicate column.
-- ============================================================

BEGIN;

-- 1. Safety: verify patients.dependency_level exists (source of truth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'dependency_level'
  ) THEN
    RAISE EXCEPTION 'patients.dependency_level does not exist — aborting migration';
  END IF;
END $$;

-- 2. Drop the duplicate column from job_postings
ALTER TABLE job_postings
  DROP COLUMN IF EXISTS dependency_level;

COMMIT;
