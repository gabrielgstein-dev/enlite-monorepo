-- Migration 043: Tabela de auditoria de onboarding
--
-- Popula a partir da aba _AuditoriaOnboarding da Planilla Operativa.
-- Registra a avaliação (Calificación 1–5) de cada worker após ser alocado.
-- É o único feedback estruturado de qualidade pós-alocação — insumo direto
-- para o score de confiabilidade do worker no matching.
--
-- Chave de deduplicação: audit_id (ex: "--1", "--2") — único por linha da planilha.
-- Permite re-importar o arquivo atualizado sem duplicar registros.

CREATE TABLE IF NOT EXISTS worker_placement_audits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave natural da planilha (--1, --2, ...)
  audit_id         VARCHAR(20) NOT NULL UNIQUE,
  audit_date       DATE,

  -- Vínculos com as entidades do sistema
  worker_id        UUID        REFERENCES workers(id) ON DELETE SET NULL,
  job_posting_id   UUID        REFERENCES job_postings(id) ON DELETE CASCADE,

  -- Dados brutos para rastreabilidade
  worker_raw_name  VARCHAR(200),
  patient_raw_name VARCHAR(200),
  coordinator_name VARCHAR(100),
  case_number_raw  INTEGER,

  -- Avaliação pós-alocação
  rating           SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  observations     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placement_audits_worker
  ON worker_placement_audits(worker_id)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placement_audits_job
  ON worker_placement_audits(job_posting_id)
  WHERE job_posting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placement_audits_rating
  ON worker_placement_audits(rating)
  WHERE rating IS NOT NULL;

CREATE TRIGGER worker_placement_audits_updated_at
  BEFORE UPDATE ON worker_placement_audits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  RAISE NOTICE 'Migration 043 concluída: tabela worker_placement_audits criada';
END $$;
