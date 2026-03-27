-- Migration 054: Increase status field length in job_postings
--
-- Problema: Valores de status do ClickUp excedem VARCHAR(20)
-- Solução: Aumentar para VARCHAR(50) para acomodar status longos

ALTER TABLE job_postings
  ALTER COLUMN status TYPE VARCHAR(50);

COMMENT ON COLUMN job_postings.status IS 
  'Status do caso no ClickUp. Valores comuns: BUSQUEDA, REEMPLAZO, COBERTURA CONFIRMADA, etc.';
