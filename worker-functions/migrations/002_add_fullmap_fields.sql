-- Migration 002: Add Fullmap Fields
-- Adiciona todos os campos necessários para suportar as telas do FlutterFlow

-- 1. Remover constraint NOT NULL de full_name (campo deprecated)
ALTER TABLE workers
  ALTER COLUMN full_name DROP NOT NULL;

-- 2. Adicionar novos campos à tabela workers
ALTER TABLE workers
  -- Separar nome completo
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(80),
  
  -- Dados demográficos
  ADD COLUMN IF NOT EXISTS sex VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  
  -- Documentação
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(30),
  
  -- Foto de perfil
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  
  -- Dados profissionais
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profession VARCHAR(50),
  ADD COLUMN IF NOT EXISTS knowledge_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS title_certificate VARCHAR(80),
  ADD COLUMN IF NOT EXISTS experience_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS years_experience VARCHAR(20),
  ADD COLUMN IF NOT EXISTS preferred_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_age_range VARCHAR(30),
  
  -- Compliance
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  
  -- Multi-região
  ADD COLUMN IF NOT EXISTS country CHAR(2) DEFAULT 'AR';

-- 2. Migrar dados existentes (separar full_name se existir)
UPDATE workers
SET 
  first_name = CASE 
    WHEN full_name IS NOT NULL AND position(' ' in full_name) > 0 
    THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  last_name = CASE 
    WHEN full_name IS NOT NULL AND position(' ' in full_name) > 0 
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE full_name IS NOT NULL 
  AND (first_name IS NULL OR last_name IS NULL);

-- 3. Atualizar worker_service_areas
ALTER TABLE worker_service_areas
  ADD COLUMN IF NOT EXISTS address_complement TEXT;

-- 4. Atualizar worker_quiz_responses
-- Renomear colunas para usar IDs ao invés de texto completo
DO $$ 
BEGIN
  -- Renomear question_text para question_id se existir
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'worker_quiz_responses' 
             AND column_name = 'question_text') THEN
    ALTER TABLE worker_quiz_responses RENAME COLUMN question_text TO question_id;
  END IF;

  -- Renomear answer_value para answer_id se existir
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'worker_quiz_responses' 
             AND column_name = 'answer_value') THEN
    ALTER TABLE worker_quiz_responses RENAME COLUMN answer_value TO answer_id;
  END IF;
END $$;

-- Remover colunas antigas que não são mais necessárias
ALTER TABLE worker_quiz_responses
  DROP COLUMN IF EXISTS is_correct,
  DROP COLUMN IF EXISTS score;

-- Adicionar section_id
ALTER TABLE worker_quiz_responses
  ADD COLUMN IF NOT EXISTS section_id VARCHAR(50);

-- Adicionar constraint unique se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                 WHERE conname = 'unique_worker_question') THEN
    ALTER TABLE worker_quiz_responses
      ADD CONSTRAINT unique_worker_question UNIQUE (worker_id, question_id);
  END IF;
END $$;

-- 5. Criar tabela worker_index para scatter-gather multi-região
CREATE TABLE IF NOT EXISTS worker_index (
  id         UUID PRIMARY KEY,
  country    CHAR(2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL,
  step       SMALLINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_index_country ON worker_index(country);
CREATE INDEX IF NOT EXISTS idx_worker_index_created ON worker_index(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_index_status ON worker_index(status);

-- 6. Popular worker_index com dados existentes
INSERT INTO worker_index (id, country, created_at, status, step)
SELECT id, COALESCE(country, 'AR'), created_at, status, current_step
FROM workers
ON CONFLICT (id) DO NOTHING;

-- 7. Criar trigger para manter worker_index sincronizado
CREATE OR REPLACE FUNCTION sync_worker_index()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO worker_index (id, country, created_at, status, step)
    VALUES (NEW.id, COALESCE(NEW.country, 'AR'), NEW.created_at, NEW.status, NEW.current_step)
    ON CONFLICT (id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE worker_index
    SET status = NEW.status, step = NEW.current_step
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM worker_index WHERE id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workers_sync_index ON workers;
CREATE TRIGGER workers_sync_index
  AFTER INSERT OR UPDATE OR DELETE ON workers
  FOR EACH ROW EXECUTE FUNCTION sync_worker_index();

-- 8. Adicionar constraints de validação
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_sex') THEN
    ALTER TABLE workers
      ADD CONSTRAINT valid_sex CHECK (sex IN ('Masculino', 'Feminino', 'Outro', NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_country') THEN
    ALTER TABLE workers
      ADD CONSTRAINT valid_country CHECK (country IN ('AR', 'BR'));
  END IF;
END $$;

-- 9. Comentários para documentação
COMMENT ON COLUMN workers.first_name IS 'Primeiro nome do worker';
COMMENT ON COLUMN workers.last_name IS 'Sobrenome do worker';
COMMENT ON COLUMN workers.sex IS 'Sexo biológico';
COMMENT ON COLUMN workers.gender IS 'Identidade de gênero';
COMMENT ON COLUMN workers.languages IS 'Array de idiomas falados';
COMMENT ON COLUMN workers.experience_types IS 'Array de tipos de experiência';
COMMENT ON COLUMN workers.preferred_types IS 'Array de tipos de atendimento preferidos';
COMMENT ON COLUMN workers.country IS 'País de operação (AR=Argentina, BR=Brasil)';
COMMENT ON TABLE worker_index IS 'Índice global para scatter-gather multi-região';

-- 10. Verificação final
DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  SELECT array_agg(column_name)
  INTO missing_columns
  FROM (
    VALUES 
      ('first_name'), ('last_name'), ('sex'), ('gender'), ('birth_date'),
      ('document_type'), ('document_number'), ('profile_photo_url'),
      ('languages'), ('profession'), ('knowledge_level'), ('title_certificate'),
      ('experience_types'), ('years_experience'), ('preferred_types'),
      ('preferred_age_range'), ('terms_accepted_at'), ('privacy_accepted_at'), ('country')
  ) AS expected(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = expected.column_name
  );

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration incomplete. Missing columns: %', array_to_string(missing_columns, ', ');
  END IF;

  RAISE NOTICE 'Migration 002 completed successfully!';
END $$;
