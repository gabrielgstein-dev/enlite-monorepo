-- ============================================================
-- Migration 015: Document Expiry Dates
--
-- Adiciona datas de vencimento nos documentos do worker.
-- Documentos que vencem na prática (Argentina):
--   - Antecedentes penais       → 3-6 meses
--   - Seguro responsabilidade   → anual
--   - Registro profissional     → pode ter vencimento
--
-- A tabela worker_documents foi criada na migration 009.
-- ============================================================

ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS criminal_record_expiry       DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry             DATE,
  ADD COLUMN IF NOT EXISTS professional_reg_expiry      DATE;

-- Índices para alertar documentos próximos do vencimento
CREATE INDEX IF NOT EXISTS idx_worker_docs_criminal_expiry
  ON worker_documents(criminal_record_expiry)
  WHERE criminal_record_expiry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_docs_insurance_expiry
  ON worker_documents(insurance_expiry)
  WHERE insurance_expiry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_docs_profreg_expiry
  ON worker_documents(professional_reg_expiry)
  WHERE professional_reg_expiry IS NOT NULL;

-- View útil: workers com documentos vencidos ou vencendo em 30 dias
CREATE OR REPLACE VIEW workers_docs_expiry_alert AS
SELECT
  w.id                          AS worker_id,
  w.funnel_stage,
  w.occupation,
  wd.criminal_record_expiry,
  wd.insurance_expiry,
  wd.professional_reg_expiry,
  -- Flags de alerta
  (wd.criminal_record_expiry  <= CURRENT_DATE + INTERVAL '30 days') AS criminal_expiring_soon,
  (wd.insurance_expiry        <= CURRENT_DATE + INTERVAL '30 days') AS insurance_expiring_soon,
  (wd.professional_reg_expiry <= CURRENT_DATE + INTERVAL '30 days') AS profreg_expiring_soon,
  -- Expirado
  (wd.criminal_record_expiry  < CURRENT_DATE) AS criminal_expired,
  (wd.insurance_expiry        < CURRENT_DATE) AS insurance_expired,
  (wd.professional_reg_expiry < CURRENT_DATE) AS profreg_expired
FROM workers w
JOIN worker_documents wd ON wd.worker_id = w.id
WHERE
  wd.criminal_record_expiry IS NOT NULL
  OR wd.insurance_expiry IS NOT NULL
  OR wd.professional_reg_expiry IS NOT NULL;

COMMENT ON COLUMN worker_documents.criminal_record_expiry  IS 'Vencimento dos antecedentes penais (normalmente 3-6 meses na AR)';
COMMENT ON COLUMN worker_documents.insurance_expiry        IS 'Vencimento do seguro de responsabilidade civil (anual)';
COMMENT ON COLUMN worker_documents.professional_reg_expiry IS 'Vencimento do registro profissional (AFIP/CRM/COREN)';

DO $$
BEGIN
  RAISE NOTICE 'Migration 015 concluída. Datas de vencimento adicionadas em worker_documents.';
END $$;
