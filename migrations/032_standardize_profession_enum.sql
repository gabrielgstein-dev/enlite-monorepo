-- ============================================================
-- Migration 031: Standardize profession to use enum values
--
-- Padroniza a coluna profession para usar apenas 4 valores:
-- AT, CARER, STUDENT, BOTH (ou NULL)
-- Isso facilita cruzamento de dados e matching
-- ============================================================

-- Adicionar constraint para validar valores de profession
ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS valid_profession_values;

ALTER TABLE workers
  ADD CONSTRAINT valid_profession_values 
  CHECK (profession IS NULL OR profession IN ('AT', 'CARER', 'STUDENT', 'BOTH'));

-- Adicionar constraint similar em job_postings.required_profession
ALTER TABLE job_postings
  DROP CONSTRAINT IF EXISTS valid_required_profession;

ALTER TABLE job_postings
  ADD CONSTRAINT valid_required_profession
  CHECK (required_profession IS NULL OR required_profession IN ('AT', 'CARER', 'STUDENT', 'BOTH'));

-- Criar índice para facilitar queries de matching
CREATE INDEX IF NOT EXISTS idx_workers_profession 
  ON workers(profession) 
  WHERE profession IS NOT NULL;

COMMENT ON CONSTRAINT valid_profession_values ON workers IS 
  'Profession must be one of: AT (Acompañante Terapéutico), CARER (Cuidador), STUDENT (Estudiante), BOTH (Ambos)';

COMMENT ON CONSTRAINT valid_required_profession ON job_postings IS 
  'Required profession must be one of: AT, CARER, STUDENT, BOTH';
