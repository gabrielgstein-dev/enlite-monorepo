-- ================================================================
-- Migration 144: job_postings.enriched_at
-- ================================================================
-- Adiciona coluna de timestamp para rastrear execuções do enrichment LLM via
-- scripts/enrich-vacancies-with-gemini.ts (Fase 3).
--
-- Coluna é APENAS timestamp; o output do LLM vai pras colunas tipadas já existentes
-- (schedule JSONB, required_professions, required_sex, etc — migration 107).
-- Nome neutro (sem prefix llm_) pra evitar confusão com o anti-pattern de "armazenar
-- output LLM em coluna sink" que a Fase 3.5 vai abolir em encuadres.
-- ================================================================

-- Caso a coluna com o nome antigo já exista (do primeiro rollout local), rename.
-- Índice antigo (idx_job_postings_llm_pending) fica como dead index — não prejudica
-- consultas (referenciava llm_enriched_at que não existe mais) mas o planner o ignora.
-- Será removido em migration futura junto com outras limpezas de índices legados.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_postings' AND column_name = 'llm_enriched_at'
  ) THEN
    ALTER TABLE job_postings RENAME COLUMN llm_enriched_at TO enriched_at;
  END IF;
END $$;

-- Add column with new name (idempotent)
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN job_postings.enriched_at IS
  'Timestamp da última execução do enrichment LLM (scripts/enrich-vacancies-with-gemini.ts).
   Coluna neutra — NÃO armazena output LLM; output vai para colunas tipadas
   (schedule JSONB, required_professions, etc).
   enriched_at IS NOT NULL indica que o parser rodou naquela vaga; não garante que
   todos os campos foram extraídos (texto pode não conter a info).';

CREATE INDEX IF NOT EXISTS idx_job_postings_enrichment_pending
  ON job_postings (id)
  WHERE enriched_at IS NULL AND schedule IS NULL AND deleted_at IS NULL;

COMMENT ON INDEX idx_job_postings_enrichment_pending IS
  'Queue index para vagas candidatas ao enrichment LLM (Fase 3). Filtros: não enriquecidas, sem schedule JSONB, não deletadas.';
