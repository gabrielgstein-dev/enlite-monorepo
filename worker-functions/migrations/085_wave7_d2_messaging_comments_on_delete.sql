-- Migration 085: D2 — Documentar 3 mecanismos de messaging + ON DELETE SET NULL
-- Descrição: Adiciona TABLE COMMENTs explicando o propósito de cada tabela de
--            mensagens e altera worker_id FK para ON DELETE SET NULL (não bloquear
--            exclusão de workers com histórico).
-- Motivo: Sem definição formal, código pode verificar fonte errada para status.
--         ON DELETE default (RESTRICT) bloqueia silenciosamente a exclusão de workers.

-- ── Table comments ──────────────────────────────────────────────────────────────

COMMENT ON TABLE messaging_outbox IS
  'Fila transacional de envios individuais com retry logic. Cada row é uma mensagem para um worker específico sobre uma candidatura. Status: pending → sent | failed.';

COMMENT ON TABLE whatsapp_bulk_dispatch_logs IS
  'Log imutável de campanhas em massa. triggered_by = Firebase UID do admin. Um envio em lote gera N linhas. Sem retry — cada row é resultado final (sent | error).';

-- ── ON DELETE SET NULL para worker_id ───────────────────────────────────────────
-- messaging_outbox: FK implícita (auto-gerada pelo REFERENCES na migration 060)
-- Precisamos dropar pelo nome auto-gerado e recriar com ON DELETE SET NULL.

-- Primeiro, tornar worker_id nullable (era NOT NULL na criação)
ALTER TABLE messaging_outbox ALTER COLUMN worker_id DROP NOT NULL;

-- Dropar FK existente e recriar com ON DELETE SET NULL
ALTER TABLE messaging_outbox
  DROP CONSTRAINT IF EXISTS messaging_outbox_worker_id_fkey;
ALTER TABLE messaging_outbox
  ADD CONSTRAINT messaging_outbox_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;

-- whatsapp_bulk_dispatch_logs: idem
ALTER TABLE whatsapp_bulk_dispatch_logs ALTER COLUMN worker_id DROP NOT NULL;

ALTER TABLE whatsapp_bulk_dispatch_logs
  DROP CONSTRAINT IF EXISTS whatsapp_bulk_dispatch_logs_worker_id_fkey;
ALTER TABLE whatsapp_bulk_dispatch_logs
  ADD CONSTRAINT whatsapp_bulk_dispatch_logs_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;
