-- Fase 9: remove colunas deprecated de job_postings.
-- Todas estas colunas foram marcadas com COMMENT DEPRECATED na migration 149.
-- Dados clínicos passam a vir exclusivamente via JOIN com patients e patient_addresses.
-- ATENÇÃO: irreversível. Rodar apenas após fila de patient_address_id IS NULL estar vazia.

ALTER TABLE job_postings
  DROP COLUMN IF EXISTS state,            -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS city,             -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS service_address_formatted,  -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS service_address_raw,        -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS service_device_types,       -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS pathology_types,            -- _deprecated_ via migration 149 COMMENT
  DROP COLUMN IF EXISTS dependency_level;           -- _deprecated_ via migration 149 COMMENT
