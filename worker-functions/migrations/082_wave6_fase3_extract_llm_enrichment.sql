-- ============================================================
-- Migration 082 — Wave 6 / N4 Fase 3
-- Extract LLM enrichment fields from job_postings into job_postings_llm_enrichment
-- ============================================================
-- Columns moved: llm_required_sex, llm_required_profession, llm_required_specialties,
--                llm_required_diagnoses, llm_parsed_schedule, llm_enriched_at
-- ============================================================

BEGIN;

-- 1. Create the enrichment table
CREATE TABLE IF NOT EXISTS job_postings_llm_enrichment (
  job_posting_id           UUID PRIMARY KEY REFERENCES job_postings(id) ON DELETE CASCADE,
  llm_required_sex         TEXT,
  llm_required_specialties JSONB DEFAULT '[]',
  llm_required_diagnoses   JSONB DEFAULT '[]',
  llm_required_profession  JSONB,
  llm_parsed_schedule      JSONB,
  llm_enriched_at          TIMESTAMPTZ
);

-- 2. Migrate existing data
INSERT INTO job_postings_llm_enrichment (
  job_posting_id, llm_required_sex, llm_required_specialties,
  llm_required_diagnoses, llm_required_profession,
  llm_parsed_schedule, llm_enriched_at
)
SELECT
  id, llm_required_sex, llm_required_specialties,
  llm_required_diagnoses,
  -- Convert TEXT with CHECK constraint to JSONB
  CASE
    WHEN llm_required_profession IS NOT NULL
    THEN to_jsonb(ARRAY[llm_required_profession])
    ELSE NULL
  END,
  llm_parsed_schedule, llm_enriched_at
FROM job_postings
WHERE llm_enriched_at IS NOT NULL
ON CONFLICT (job_posting_id) DO NOTHING;

-- 3. Drop migrated columns from job_postings
-- Must drop the CHECK constraint first (llm_required_profession has one)
ALTER TABLE job_postings
  DROP COLUMN IF EXISTS llm_required_sex,
  DROP COLUMN IF EXISTS llm_required_profession,
  DROP COLUMN IF EXISTS llm_required_specialties,
  DROP COLUMN IF EXISTS llm_required_diagnoses,
  DROP COLUMN IF EXISTS llm_parsed_schedule,
  DROP COLUMN IF EXISTS llm_enriched_at;

COMMIT;
