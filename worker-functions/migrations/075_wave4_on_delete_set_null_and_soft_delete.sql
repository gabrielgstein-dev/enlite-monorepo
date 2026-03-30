-- ============================================================
-- Migration 075: Wave 4 — D6 — ON DELETE SET NULL + deleted_at
--
-- Problema A: encuadres.job_posting_id e worker_placement_audits.job_posting_id
-- usam ON DELETE CASCADE. Se um job_posting for deletado, entrevistas e
-- auditorias são destruídas em cascata — dados auditáveis por reguladores.
--
-- Problema B: job_postings não tem deleted_at. Sem soft delete,
-- qualquer DELETE físico é irreversível.
--
-- Solução:
--   1. Alterar FK para ON DELETE SET NULL (preserva histórico)
--   2. Adicionar deleted_at em job_postings (soft delete)
-- ============================================================

-- 1. Alterar encuadres: ON DELETE CASCADE → ON DELETE SET NULL
ALTER TABLE encuadres
  DROP CONSTRAINT IF EXISTS encuadres_job_posting_id_fkey;

ALTER TABLE encuadres
  ADD CONSTRAINT encuadres_job_posting_id_fkey
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE SET NULL;

-- 2. Alterar worker_placement_audits: ON DELETE CASCADE → ON DELETE SET NULL
ALTER TABLE worker_placement_audits
  DROP CONSTRAINT IF EXISTS worker_placement_audits_job_posting_id_fkey;

ALTER TABLE worker_placement_audits
  ADD CONSTRAINT worker_placement_audits_job_posting_id_fkey
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE SET NULL;

-- 3. Adicionar deleted_at em job_postings para soft delete
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN job_postings.deleted_at IS
  'Soft delete: preenchido em vez de DELETE físico. '
  'Registros com deleted_at IS NOT NULL são ignorados em queries operacionais.';

-- Índice parcial para queries que filtram por soft delete
CREATE INDEX IF NOT EXISTS idx_job_postings_deleted_at
  ON job_postings(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Índice parcial para queries operacionais (registros ativos)
CREATE INDEX IF NOT EXISTS idx_job_postings_active_not_deleted
  ON job_postings(status, published_at DESC)
  WHERE deleted_at IS NULL AND status = 'active';

-- Validação
DO $$
DECLARE
  enc_fk_action TEXT;
  wpa_fk_action TEXT;
  has_deleted_at BOOLEAN;
BEGIN
  -- Verificar que encuadres FK é SET NULL
  SELECT confdeltype INTO enc_fk_action
  FROM pg_constraint
  WHERE conrelid = 'encuadres'::regclass
    AND conname = 'encuadres_job_posting_id_fkey';
  IF enc_fk_action != 'n' THEN
    RAISE EXCEPTION 'encuadres FK deveria ser SET NULL (n), mas é: %', enc_fk_action;
  END IF;

  -- Verificar que worker_placement_audits FK é SET NULL
  SELECT confdeltype INTO wpa_fk_action
  FROM pg_constraint
  WHERE conrelid = 'worker_placement_audits'::regclass
    AND conname = 'worker_placement_audits_job_posting_id_fkey';
  IF wpa_fk_action != 'n' THEN
    RAISE EXCEPTION 'worker_placement_audits FK deveria ser SET NULL (n), mas é: %', wpa_fk_action;
  END IF;

  -- Verificar que deleted_at existe
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_postings' AND column_name = 'deleted_at'
  ) INTO has_deleted_at;
  IF NOT has_deleted_at THEN
    RAISE EXCEPTION 'job_postings.deleted_at não foi criada';
  END IF;

  RAISE NOTICE 'Migration 075 concluída: ON DELETE SET NULL + soft delete em job_postings';
END $$;
