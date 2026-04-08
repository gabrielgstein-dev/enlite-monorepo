-- Migration 119: Fix talentum_slug size + drop deprecated case_number unique constraint
--
-- Problema 1: talentum_slug VARCHAR(20) é curto demais para slugs reais do Talentum.
-- Slugs podem conter título completo slugificado (ex: "caso-483-at-para-pacientes-con-retraso-mental-leve").
-- Fix: ampliar para VARCHAR(255).
--
-- Problema 2: migration 114 deprecou a UNIQUE constraint de case_number (renomeou para
-- idx_job_postings_case_number_deprecated_20260406), mas não removeu. O índice renomeado
-- ainda impõe unicidade, impedindo múltiplas vacantes para o mesmo caso clínico.
-- Fix: DROP do índice deprecated.

BEGIN;

-- 1. Ampliar talentum_slug para VARCHAR(255)
ALTER TABLE job_postings
  ALTER COLUMN talentum_slug TYPE VARCHAR(255);

-- 2. Remover índice UNIQUE deprecated de case_number
DROP INDEX IF EXISTS idx_job_postings_case_number_deprecated_20260406;

COMMIT;
