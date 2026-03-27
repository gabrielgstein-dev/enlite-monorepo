-- Migration 053: Standardize occupation to English + profession array in job_postings
--
-- Problemas corrigidos:
-- 1. workers.occupation usava espanhol (CUIDADOR, AMBOS) enquanto o padrão do sistema
--    (classifyProfession, migration 032) já era inglês (CARER, BOTH)
-- 2. llm_required_sex não tinha valor 'BOTH' para vagas que aceitam qualquer sexo
-- 3. llm_required_profession era TEXT simples — precisa ser TEXT[] para vagas que
--    aceitam múltiplas profissões (ex: AT+CARER, AT+STUDENT)
-- 4. workers.occupation não incluía STUDENT

-- ─── 1. Migrar dados existentes de espanhol para inglês ──────────────────────

UPDATE workers SET occupation = 'CARER' WHERE occupation = 'CUIDADOR';
UPDATE workers SET occupation = 'BOTH'  WHERE occupation = 'AMBOS';

-- ─── 2. Atualizar CHECK constraint de workers.occupation ─────────────────────

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_occupation_check;

ALTER TABLE workers
  ADD CONSTRAINT workers_occupation_check
  CHECK (occupation IN ('AT', 'CARER', 'STUDENT', 'BOTH'));

-- ─── 3. Migrar dados existentes em job_postings.llm_required_profession ──────

-- Primeiro normaliza valores espanhóis para inglês (TEXT ainda)
UPDATE job_postings SET llm_required_profession = 'CARER' WHERE llm_required_profession = 'CUIDADOR';
UPDATE job_postings SET llm_required_profession = 'BOTH'  WHERE llm_required_profession = 'AMBOS';

-- ─── 4. Converter llm_required_profession de TEXT para TEXT[] ────────────────

ALTER TABLE job_postings
  DROP CONSTRAINT IF EXISTS job_postings_llm_required_profession_check;

-- BOTH expandido para array completo; outros valores viram array unitário
ALTER TABLE job_postings
  ALTER COLUMN llm_required_profession TYPE TEXT[]
  USING CASE
    WHEN llm_required_profession IS NULL    THEN NULL
    WHEN llm_required_profession = 'BOTH'  THEN ARRAY['AT', 'CARER', 'STUDENT']
    ELSE ARRAY[llm_required_profession]
  END;

-- ─── 5. Atualizar comentários ─────────────────────────────────────────────────

COMMENT ON COLUMN job_postings.llm_required_sex IS
  'Sexo requerido extraído por LLM: M=masculino, F=feminino, BOTH=aceita qualquer sexo, null=sem restrição';

COMMENT ON COLUMN job_postings.llm_required_profession IS
  'Profissões aceitas pela vaga (TEXT[]). Valores: AT, CARER, STUDENT. null=não especificado. Ex: ARRAY[''AT'',''CARER'']';
