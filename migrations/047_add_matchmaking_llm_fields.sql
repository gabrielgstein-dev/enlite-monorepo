-- Migration 047: Add matchmaking LLM fields to job_postings
--
-- Campos para armazenar os dados parseados pelo LLM a partir de
-- worker_profile_sought e schedule_days_hours (texto livre).
-- Esses campos estruturados alimentam as fases de hard filter e scoring do matchmaking.

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS llm_required_sex        TEXT,
  ADD COLUMN IF NOT EXISTS llm_required_profession TEXT
    CHECK (llm_required_profession IN ('AT', 'CUIDADOR', 'AMBOS')),
  ADD COLUMN IF NOT EXISTS llm_required_specialties JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS llm_required_diagnoses   JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS llm_parsed_schedule      JSONB,
  -- Estrutura esperada: { "days": [1,2,3,4,5], "slots": [{"start":"08:00","end":"16:00"}], "interpretation": "..." }
  -- days: 0=Domingo, 1=Segunda, ..., 6=Sábado
  ADD COLUMN IF NOT EXISTS llm_enriched_at          TIMESTAMPTZ;

COMMENT ON COLUMN job_postings.llm_required_sex        IS 'Sexo requerido extraído por LLM de worker_profile_sought: M, F, ou null (sem restrição)';
COMMENT ON COLUMN job_postings.llm_required_profession IS 'Profissão requerida extraída por LLM: AT, CUIDADOR, AMBOS ou null (não especificado)';
COMMENT ON COLUMN job_postings.llm_required_specialties IS 'Especialidades requeridas extraídas por LLM (JSONB array de strings)';
COMMENT ON COLUMN job_postings.llm_required_diagnoses  IS 'Diagnósticos clínicos relevantes extraídos por LLM (JSONB array de strings)';
COMMENT ON COLUMN job_postings.llm_parsed_schedule     IS 'Horário estruturado extraído por LLM de schedule_days_hours';
COMMENT ON COLUMN job_postings.llm_enriched_at         IS 'Timestamp da última extração LLM dos campos de texto livre';

CREATE INDEX IF NOT EXISTS idx_job_postings_llm_enriched
  ON job_postings(llm_enriched_at)
  WHERE llm_enriched_at IS NOT NULL;
