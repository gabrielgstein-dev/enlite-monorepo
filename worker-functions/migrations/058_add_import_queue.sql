-- Fase 5: Fila de Imports + Cancelamento
-- Expande o CHECK constraint de status para incluir 'queued' e 'cancelled',
-- adiciona campo de auditoria cancelled_at e índice parcial para a fila.

-- 1. Dropar o CHECK constraint existente antes de adicionar novos valores
ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_status_check;

-- 2. Recriar com os novos valores
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'error', 'queued', 'cancelled'));

-- 3. Campo de auditoria de cancelamento
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Índice parcial para recuperação eficiente de jobs na fila
--    Usado por GET /api/import/queue e pelo startup recovery
CREATE INDEX IF NOT EXISTS idx_import_jobs_queued_created
  ON import_jobs (created_at ASC)
  WHERE status = 'queued';
