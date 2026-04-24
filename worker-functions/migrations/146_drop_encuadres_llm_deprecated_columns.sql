-- Migration 146 — Drop _deprecated_20260424 llm_* columns from encuadres.
-- Preceded by migration 145 (rename) — safe to run immediately as no data existed.
-- Validates: no application code reads/writes llm_* on encuadres (cleaned in Fase 3.5).

DROP INDEX IF EXISTS idx_encuadres_llm_processed_at_deprecated_20260424;
DROP INDEX IF EXISTS idx_encuadres_llm_pending_deprecated_20260424;

ALTER TABLE encuadres
  DROP COLUMN IF EXISTS llm_processed_at_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_interest_level_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_extracted_experience_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_availability_notes_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_real_rejection_reason_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_follow_up_potential_deprecated_20260424,
  DROP COLUMN IF EXISTS llm_raw_response_deprecated_20260424;
