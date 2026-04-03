-- Migration 107: Add complete vacancy form fields + remove replaced columns
-- Step 5 of Talentum Outbound Roadmap
--
-- Adds structured fields so the admin form captures everything needed
-- for operation and Talentum publication directly in job_postings.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. ADD new columns to job_postings
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS required_professions   TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_sex           TEXT,
  ADD COLUMN IF NOT EXISTS age_range_min          INTEGER,
  ADD COLUMN IF NOT EXISTS age_range_max          INTEGER,
  ADD COLUMN IF NOT EXISTS required_experience    TEXT,
  ADD COLUMN IF NOT EXISTS worker_attributes      TEXT,
  ADD COLUMN IF NOT EXISTS pathology_types        TEXT,
  ADD COLUMN IF NOT EXISTS salary_text            TEXT     DEFAULT 'A convenir',
  ADD COLUMN IF NOT EXISTS payment_day            TEXT,
  ADD COLUMN IF NOT EXISTS dependency_level       TEXT,
  ADD COLUMN IF NOT EXISTS service_device_types   TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule               JSONB;

-- ─────────────────────────────────────────────────────────────────
-- 2. MIGRATE data from old columns to new ones
-- ─────────────────────────────────────────────────────────────────

-- required_profession (singular) → required_professions (array)
UPDATE job_postings
SET required_professions = ARRAY[required_profession]
WHERE required_profession IS NOT NULL
  AND (required_professions IS NULL OR required_professions = '{}');

-- salary_range_min/max/currency → salary_text
UPDATE job_postings
SET salary_text = CONCAT(salary_range_min::TEXT, ' - ', salary_range_max::TEXT, ' ', currency)
WHERE salary_range_min IS NOT NULL
  AND (salary_text IS NULL OR salary_text = 'A convenir');

-- ─────────────────────────────────────────────────────────────────
-- 3. DROP constraints that reference columns being removed
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS valid_required_profession;
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS valid_salary_range;

-- ─────────────────────────────────────────────────────────────────
-- 4. DROP replaced columns from job_postings
-- ─────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_job_postings_profession;

ALTER TABLE job_postings
  DROP COLUMN IF EXISTS required_profession,
  DROP COLUMN IF EXISTS salary_range_min,
  DROP COLUMN IF EXISTS salary_range_max,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS preferred_age_range,
  DROP COLUMN IF EXISTS required_experience_years;

-- NOTE: schedule_days_hours is intentionally KEPT for backward compatibility.
-- It is still read by MatchmakingService, JobPostingEnrichmentService,
-- RecruitmentController, OperationalRepositories, and ClickUpCaseRepository.
-- It will be removed in a future migration once those services use `schedule` JSONB.

-- ─────────────────────────────────────────────────────────────────
-- 5. DROP llm_parsed_schedule from enrichment table
--    (replaced by manual `schedule` JSONB in job_postings)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE job_postings_llm_enrichment
  DROP COLUMN IF EXISTS llm_parsed_schedule;

COMMIT;
