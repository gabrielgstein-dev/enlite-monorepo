-- Migration 045: rejection_reason em inglês + normalizar status existentes
--
-- rejection_reason: enum de 3 valores reais da planilha, mapeados para inglês:
--   'Otros'                    → 'other'
--   'Horarios incompatibles'   → 'incompatible_schedule'
--   'Distancia al dispositivo' → 'distance'
--
-- status: normaliza os 18 registros do ClickUp que vieram com 'REEMPLAZOS' (espanhol)
--   para o slug inglês padrão 'replacement'.

-- ── 1. rejection_reason: remover constraint antiga, mudar tipo, recriar em inglês ──
ALTER TABLE encuadres
  DROP CONSTRAINT IF EXISTS encuadres_rejection_reason_check;

ALTER TABLE encuadres
  ALTER COLUMN rejection_reason TYPE VARCHAR(30);

ALTER TABLE encuadres
  ADD CONSTRAINT encuadres_rejection_reason_check
  CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'other',
    'incompatible_schedule',
    'distance'
  ));

CREATE INDEX IF NOT EXISTS idx_encuadres_rejection_reason
  ON encuadres(rejection_reason)
  WHERE rejection_reason IS NOT NULL;

-- ── 2. Normalizar status existentes de espanhol para inglês ─────────────────────
-- ClickUp enviou 'REEMPLAZOS' → slug correto é 'replacement'
UPDATE job_postings
  SET status = 'replacement'
  WHERE status IN ('REEMPLAZOS', 'REEMPLAZO');

DO $$ BEGIN
  RAISE NOTICE 'Migration 045 concluída: rejection_reason em inglês + status normalizados';
END $$;
