-- ============================================================
-- Migration 033: Fix case_number UNIQUE constraint
-- 
-- Problema: O índice parcial (com WHERE) não pode ser usado em ON CONFLICT
-- Solução: Recriar como índice UNIQUE completo
-- ============================================================

-- Remove o índice parcial existente
DROP INDEX IF EXISTS idx_job_postings_case_number;

-- Cria índice UNIQUE completo (sem WHERE clause)
-- Isso permite usar ON CONFLICT (case_number) no código
CREATE UNIQUE INDEX idx_job_postings_case_number
  ON job_postings(case_number);

-- Comentário explicativo
COMMENT ON INDEX idx_job_postings_case_number IS 
  'UNIQUE constraint on case_number - allows ON CONFLICT upserts. NULL values are allowed and do not conflict.';
