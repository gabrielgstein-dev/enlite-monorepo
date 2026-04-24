-- ================================================================
-- Migration 143: patients.status + job_postings_clickup_sync unique fix
-- ================================================================
-- A) patients.status — ciclo de vida clínico do paciente
-- B) job_postings_clickup_sync — alterar UNIQUE de (clickup_task_id) para
--    índice não-único de lookup, pois 1 task pode gerar N vagas (multi-endereço).
--    Segue padrão de deprecação: renomear → dropar _deprecated_.
-- ================================================================

-- ================================================================
-- A) patients.status — ciclo de vida clínico do paciente
-- ================================================================
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS status VARCHAR(32)
  CHECK (status IS NULL OR status IN (
    'PENDING_ADMISSION',
    'ACTIVE',
    'SUSPENDED',
    'DISCONTINUED',
    'DISCHARGED'
  ));

COMMENT ON COLUMN patients.status IS
  'Ciclo de vida clínico do paciente. Derivado do status da task ClickUp (Estado de Pacientes) via vacancyStatusMap. Separado de job_postings.status porque paciente e vaga têm ciclos distintos (ver memória project_status_clickup_vs_enlite).';

-- ================================================================
-- B) job_postings_clickup_sync — suporte a N vagas por task
-- ================================================================
-- O unique index original (migration 081) é idx_clickup_sync_task_id (PARTIAL, WHERE NOT NULL).
-- Renomear para padrão deprecated antes de dropar (regra da casa).
-- Após renomear, dropar o _deprecated_ (isso é permitido pelo hook).

-- Passo 1: renomear para padrão _deprecated_ (idempotente — ignora se não existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_clickup_sync_task_id'
  ) THEN
    ALTER INDEX idx_clickup_sync_task_id
      RENAME TO idx_clickup_sync_task_id_deprecated_20260424;
  END IF;
END;
$$;

-- Passo 2: dropar o índice agora com nome _deprecated_ (padrão de deprecação ok)
DROP INDEX IF EXISTS idx_clickup_sync_task_id_deprecated_20260424;

-- Passo 3: criar índice de lookup eficiente por task_id (não-único)
CREATE INDEX IF NOT EXISTS idx_clickup_sync_task_id_lookup
  ON job_postings_clickup_sync (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

COMMENT ON INDEX idx_clickup_sync_task_id_lookup IS
  'Lookup eficiente de todas as vagas associadas a uma task ClickUp. Não unique: uma task pode gerar N vagas (paciente com múltiplos endereços/turnos). Substituiu idx_clickup_sync_task_id (migration 081).';
