-- Migration 106: Add Talentum outbound fields to job_postings + prescreening config tables
-- Supports publishing vacancies to Talentum.chat prescreening bot

-- 1. New columns on job_postings for Talentum reference
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS talentum_project_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS talentum_public_id UUID,
  ADD COLUMN IF NOT EXISTS talentum_whatsapp_url TEXT,
  ADD COLUMN IF NOT EXISTS talentum_slug VARCHAR(20),
  ADD COLUMN IF NOT EXISTS talentum_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS talentum_description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_talentum_project_id
  ON job_postings (talentum_project_id) WHERE talentum_project_id IS NOT NULL;

-- 2. Prescreening questions configurable per job posting
CREATE TABLE IF NOT EXISTS job_posting_prescreening_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  question_order SMALLINT NOT NULL,

  -- Fields that map 1:1 to the Talentum API
  question TEXT NOT NULL,
  response_type TEXT[] NOT NULL DEFAULT '{text,audio}',
  desired_response TEXT NOT NULL,
  weight SMALLINT NOT NULL CHECK (weight BETWEEN 1 AND 10),
  required BOOLEAN NOT NULL DEFAULT false,
  analyzed BOOLEAN NOT NULL DEFAULT true,
  early_stoppage BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_posting_id, question_order)
);

CREATE INDEX IF NOT EXISTS idx_prescreening_questions_job_posting
  ON job_posting_prescreening_questions (job_posting_id);

-- 3. FAQ configurable per job posting
CREATE TABLE IF NOT EXISTS job_posting_prescreening_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  faq_order SMALLINT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_posting_id, faq_order)
);
