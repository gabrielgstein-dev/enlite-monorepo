-- Migration 008: Add Extended Worker Fields
-- Campos adicionais que serão coletados na tela de documentos
-- NÃO altera o fluxo de registro inicial (3 steps)

-- 1. Adicionar campos demográficos estendidos
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS sexual_orientation VARCHAR(30),
  ADD COLUMN IF NOT EXISTS race VARCHAR(30),
  ADD COLUMN IF NOT EXISTS religion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS hobbies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS diagnostic_preferences TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255);

-- 2. Adicionar constraints de validação
ALTER TABLE workers
  ADD CONSTRAINT valid_weight CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)),
  ADD CONSTRAINT valid_height CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300));

-- 3. Comentários para documentação
COMMENT ON COLUMN workers.sexual_orientation IS 'Orientação sexual (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.race IS 'Origem racial (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.religion IS 'Religião (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.weight_kg IS 'Peso em kg (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.height_cm IS 'Altura em cm (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.hobbies IS 'Array de hobbies/habilidades (opcional, coletado na tela de documentos)';
COMMENT ON COLUMN workers.diagnostic_preferences IS 'Array de hipóteses diagnósticas de preferência (opcional)';
COMMENT ON COLUMN workers.linkedin_url IS 'URL do perfil LinkedIn (opcional)';

-- 4. Índices para campos que podem ser usados em queries
CREATE INDEX IF NOT EXISTS idx_workers_linkedin ON workers(linkedin_url) WHERE linkedin_url IS NOT NULL;
