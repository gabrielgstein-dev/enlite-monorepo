-- ============================================================
-- Migration 114: Add vacancy_number, remove UNIQUE from case_number
--
-- Motivo: case_number é o identificador do caso clínico (paciente).
-- Um caso pode ter N vacantes. vacancy_number é o identificador
-- único interno da vacante, gerado por SEQUENCE.
--
-- Título da vacante passa a ser: CASO {case_number}-{vacancy_number}
-- ============================================================

BEGIN;

-- 1. Criar SEQUENCE para vacancy_number
CREATE SEQUENCE IF NOT EXISTS job_postings_vacancy_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 2. Adicionar coluna vacancy_number (nullable inicialmente para backfill)
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS vacancy_number INTEGER;

-- 3. Backfill: atribuir vacancy_number sequencial a todos os registros existentes
--    Ordem por created_at preserva sequência histórica natural.
UPDATE job_postings
SET vacancy_number = sub.new_vn
FROM (
  SELECT id,
         nextval('job_postings_vacancy_number_seq') AS new_vn
  FROM job_postings
  ORDER BY created_at ASC, id ASC
) sub
WHERE job_postings.id = sub.id
  AND job_postings.vacancy_number IS NULL;

-- 4. Avançar a SEQUENCE para após o maior valor atribuído no backfill
SELECT setval(
  'job_postings_vacancy_number_seq',
  GREATEST((SELECT COALESCE(MAX(vacancy_number), 0) FROM job_postings), 1)
);

-- 5. Tornar vacancy_number NOT NULL e DEFAULT via SEQUENCE
ALTER TABLE job_postings
  ALTER COLUMN vacancy_number SET NOT NULL,
  ALTER COLUMN vacancy_number SET DEFAULT nextval('job_postings_vacancy_number_seq');

-- 6. Associar a SEQUENCE à coluna
ALTER SEQUENCE job_postings_vacancy_number_seq
  OWNED BY job_postings.vacancy_number;

-- 7. Criar UNIQUE constraint em vacancy_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_vacancy_number
  ON job_postings (vacancy_number);

-- 8. Deprecar UNIQUE constraint de case_number (permite duplicatas)
--    Renomear antes de dropar conforme padrão de deprecação do projeto.
ALTER INDEX IF EXISTS idx_job_postings_case_number
  RENAME TO idx_job_postings_case_number_deprecated_20260406;

-- 9. Criar case_number como índice não-único (buscas continuam eficientes)
CREATE INDEX IF NOT EXISTS idx_job_postings_case_number_nonunique
  ON job_postings (case_number)
  WHERE case_number IS NOT NULL;

-- Verificação final
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_postings' AND column_name = 'vacancy_number'
  ) THEN
    RAISE EXCEPTION 'Migration 114 falhou: vacancy_number não criado';
  END IF;
  RAISE NOTICE 'Migration 114 concluída: vacancy_number adicionado, UNIQUE de case_number deprecado';
END $$;

COMMIT;
