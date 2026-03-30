-- ============================================================
-- Migration 081 — Wave 6 / N4 Fase 2
-- Extract ClickUp sync metadata from job_postings into job_postings_clickup_sync
-- ============================================================
-- Columns moved: clickup_task_id, source_created_at, source_updated_at,
--                last_comment, comment_count
-- The clickup_task_id UNIQUE constraint moves to the new table.
-- ============================================================

BEGIN;

-- 1. Create the sync table
CREATE TABLE IF NOT EXISTS job_postings_clickup_sync (
  job_posting_id       UUID PRIMARY KEY REFERENCES job_postings(id) ON DELETE CASCADE,
  clickup_task_id      TEXT,
  clickup_status       TEXT,
  clickup_priority     TEXT,
  source_created_at    TIMESTAMPTZ,
  source_updated_at    TIMESTAMPTZ,
  last_clickup_comment TEXT,
  comment_count        INT4,
  synced_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on clickup_task_id (migrated from job_postings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clickup_sync_task_id
  ON job_postings_clickup_sync (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

-- 2. Migrate existing data
INSERT INTO job_postings_clickup_sync (
  job_posting_id, clickup_task_id, source_created_at, source_updated_at,
  last_clickup_comment, comment_count
)
SELECT
  id, clickup_task_id, source_created_at, source_updated_at,
  last_comment, comment_count
FROM job_postings
WHERE clickup_task_id IS NOT NULL
   OR source_created_at IS NOT NULL
   OR source_updated_at IS NOT NULL
   OR last_comment IS NOT NULL
   OR comment_count IS NOT NULL
ON CONFLICT (job_posting_id) DO NOTHING;

-- 3. Drop the unique index on clickup_task_id from job_postings before dropping column
DROP INDEX IF EXISTS idx_job_postings_clickup_task_id;
DROP INDEX IF EXISTS job_postings_clickup_task_id_key;

-- 4. Drop migrated columns from job_postings
ALTER TABLE job_postings
  DROP COLUMN IF EXISTS clickup_task_id,
  DROP COLUMN IF EXISTS source_created_at,
  DROP COLUMN IF EXISTS source_updated_at,
  DROP COLUMN IF EXISTS last_comment,
  DROP COLUMN IF EXISTS comment_count;

COMMIT;
