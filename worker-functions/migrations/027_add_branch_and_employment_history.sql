-- ============================================================
-- Migration 027: Add Branch Office and Employment History
--
-- Adiciona:
--   1. branch_office em workers (Delegación/Sucursal do Ana Care)
--   2. worker_employment_history (histórico de contratações/demissões)
-- ============================================================

-- ── STEP 1: Adicionar branch_office em workers ──────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS branch_office VARCHAR(100);

COMMENT ON COLUMN workers.branch_office IS 'Delegação/Sucursal/Filial onde o worker está alocado (Ana Care)';

CREATE INDEX IF NOT EXISTS idx_workers_branch_office ON workers(branch_office)
  WHERE branch_office IS NOT NULL;

-- ── STEP 2: Criar tabela worker_employment_history ──────────────────────────
CREATE TABLE IF NOT EXISTS worker_employment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  
  -- Datas de contratação e desligamento
  hired_at DATE,
  terminated_at DATE,
  termination_reason TEXT,
  
  -- Tipo de vínculo empregatício
  employment_type VARCHAR(50) CHECK (employment_type IN (
    'ana_care',      -- Contratado pela Ana Care
    'enlite',        -- Contratado pela Enlite
    'temporary',     -- Temporário/eventual
    'contractor',    -- Prestador de serviços
    'other'          -- Outro
  )),
  
  -- Observações adicionais
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_worker_employment_history_worker 
  ON worker_employment_history(worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_employment_history_dates 
  ON worker_employment_history(hired_at, terminated_at);

CREATE INDEX IF NOT EXISTS idx_worker_employment_history_active 
  ON worker_employment_history(worker_id, terminated_at)
  WHERE terminated_at IS NULL;

-- Trigger para updated_at
CREATE TRIGGER worker_employment_history_updated_at
  BEFORE UPDATE ON worker_employment_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── STEP 3: View para workers ativos com histórico atual ────────────────────
CREATE OR REPLACE VIEW v_workers_current_employment AS
SELECT
  w.id AS worker_id,
  w.email,
  w.phone,
  w.overall_status,
  w.occupation,
  w.branch_office,
  
  weh.id AS current_employment_id,
  weh.hired_at,
  weh.employment_type,
  weh.notes AS employment_notes,
  
  -- Tempo de serviço em dias
  CASE 
    WHEN weh.hired_at IS NOT NULL 
    THEN CURRENT_DATE - weh.hired_at 
    ELSE NULL 
  END AS days_employed

FROM workers w
LEFT JOIN worker_employment_history weh ON (
  w.id = weh.worker_id 
  AND weh.terminated_at IS NULL
)
WHERE w.overall_status IN ('ACTIVE', 'HIRED');

-- Comentários
COMMENT ON TABLE worker_employment_history IS 'Histórico de contratações e desligamentos dos workers';
COMMENT ON VIEW v_workers_current_employment IS 'Workers ativos com seu vínculo empregatício atual';

DO $$ BEGIN RAISE NOTICE 'Migration 027 concluída: branch_office e worker_employment_history criados'; END $$;
