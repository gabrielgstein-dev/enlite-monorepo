-- ============================================================
-- Migration 030: Drop worker_index trigger and function
--
-- A tabela worker_index foi removida na migration 028, mas o
-- trigger workers_sync_index ainda existe e está causando erro
-- ao tentar inserir workers.
-- ============================================================

-- Drop trigger
DROP TRIGGER IF EXISTS workers_sync_index ON workers;

-- Drop function
DROP FUNCTION IF EXISTS sync_worker_index();
