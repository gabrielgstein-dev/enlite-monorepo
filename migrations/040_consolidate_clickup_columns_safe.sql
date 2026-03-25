-- 040_consolidate_clickup_columns_safe.sql
-- Versão segura que verifica se as colunas já foram migradas

DO $$
BEGIN
  -- 1. RENAME clickup_task_id → source_id (se ainda não foi feito)
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_task_id') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_task_id TO source_id;
  END IF;

  -- 2. RENAME clickup_date_created → source_created_at
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_date_created') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_date_created TO source_created_at;
  END IF;

  -- 3. RENAME clickup_date_updated → source_updated_at
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_date_updated') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_date_updated TO source_updated_at;
  END IF;

  -- 4. RENAME clickup_date_due → due_date
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_date_due') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_date_due TO due_date;
  END IF;

  -- 5. RENAME last_clickup_comment → last_comment
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'last_clickup_comment') THEN
    ALTER TABLE job_postings RENAME COLUMN last_clickup_comment TO last_comment;
  END IF;

  -- 6. RENAME clickup_comment_count → comment_count
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_comment_count') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_comment_count TO comment_count;
  END IF;

  -- 7. RENAME clickup_assignee → assignee
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_assignee') THEN
    ALTER TABLE job_postings RENAME COLUMN clickup_assignee TO assignee;
  END IF;

  -- 8. Migração de dados: clickup_status → status
  ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS valid_job_status;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_status') THEN
    UPDATE job_postings SET status = clickup_status WHERE clickup_status IS NOT NULL;
    ALTER TABLE job_postings DROP COLUMN clickup_status;
  END IF;

  -- 9. Migração de dados: clickup_priority → priority
  ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_priority_check;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_priority') THEN
    UPDATE job_postings SET priority = clickup_priority WHERE clickup_priority IS NOT NULL;
    ALTER TABLE job_postings DROP COLUMN clickup_priority;
  END IF;

  -- 10. Migração de dados: clickup_task_name → title
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_task_name') THEN
    UPDATE job_postings SET title = clickup_task_name WHERE clickup_task_name IS NOT NULL;
    ALTER TABLE job_postings DROP COLUMN clickup_task_name;
  END IF;

  -- 11. Migração de dados: clickup_task_content → description
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'job_postings' AND column_name = 'clickup_task_content') THEN
    UPDATE job_postings SET description = clickup_task_content WHERE clickup_task_content IS NOT NULL;
    ALTER TABLE job_postings DROP COLUMN clickup_task_content;
  END IF;

  -- 12. DROP de colunas que vivem em patients
  ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_dependency_check;
  ALTER TABLE job_postings DROP COLUMN IF EXISTS dependency;
  ALTER TABLE job_postings DROP COLUMN IF EXISTS patient_name;

  -- 13. Atualizar índice no source_id
  DROP INDEX IF EXISTS idx_job_postings_clickup_task_id;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_job_postings_source_id') THEN
    CREATE UNIQUE INDEX idx_job_postings_source_id ON job_postings (source_id) WHERE source_id IS NOT NULL;
  END IF;

END $$;
