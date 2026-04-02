-- Migration 105: Alterar preferred_age_range de VARCHAR(30) para TEXT[]
-- Suporta multi-select de faixa etária no perfil do worker

ALTER TABLE workers
  ALTER COLUMN preferred_age_range DROP DEFAULT,
  ALTER COLUMN preferred_age_range TYPE TEXT[]
    USING CASE
      WHEN preferred_age_range IS NULL THEN NULL
      WHEN preferred_age_range = '' THEN '{}'::TEXT[]
      ELSE ARRAY[preferred_age_range]
    END;
