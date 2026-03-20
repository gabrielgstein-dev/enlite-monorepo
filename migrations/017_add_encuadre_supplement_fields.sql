-- ============================================================
-- Migration 017: Adiciona campos suplementares na tabela encuadres
--
-- Esses campos existem nas abas individuais por caso da Planilla
-- Operativa (ex: "738 - Silva Lautaro") mas NÃO no _Base1.
-- O import cruzado (_Base1 → individual sheets) preenche esses campos
-- nos registros existentes via soft-match (job_posting_id + phone + date).
-- ============================================================

ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS origen        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS id_onboarding VARCHAR(100);

-- Índice para soft-match durante import cruzado
CREATE INDEX IF NOT EXISTS idx_encuadres_soft_match
  ON encuadres(job_posting_id, worker_raw_phone, interview_date)
  WHERE job_posting_id IS NOT NULL
    AND worker_raw_phone IS NOT NULL;

RAISE NOTICE 'Migration 017 concluída: origen + id_onboarding adicionados às encuadres';
