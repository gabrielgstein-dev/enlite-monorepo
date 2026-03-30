-- Migration 087: D9 — Política de retenção + índice para archiving
-- Descrição: Adiciona índice em messaging_outbox.processed_at para otimizar
--            o job de archiving semanal e cria função de cleanup reutilizável.
-- Motivo: Tabelas messaging_outbox, whatsapp_bulk_dispatch_logs e
--         worker_status_history crescem indefinidamente sem política de TTL.

-- ── Índice para job de archiving ────────────────────────────────────────────────
-- Otimiza DELETE WHERE processed_at < NOW() - INTERVAL '90 days'
CREATE INDEX IF NOT EXISTS idx_messaging_outbox_processed_at
  ON messaging_outbox(processed_at)
  WHERE processed_at IS NOT NULL AND status IN ('sent', 'failed');

-- ── Função de archiving reutilizável ────────────────────────────────────────────
-- Pode ser chamada pelo n8n via: SELECT archive_old_messages();
CREATE OR REPLACE FUNCTION archive_old_messages(
  p_outbox_retention_days INT DEFAULT 90,
  p_bulk_retention_days INT DEFAULT 365
)
RETURNS TABLE(outbox_deleted BIGINT, bulk_deleted BIGINT) AS $$
DECLARE
  v_outbox_deleted BIGINT;
  v_bulk_deleted BIGINT;
BEGIN
  -- messaging_outbox: remover sent/failed com mais de N dias
  DELETE FROM messaging_outbox
  WHERE status IN ('sent', 'failed')
    AND processed_at < NOW() - (p_outbox_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  -- whatsapp_bulk_dispatch_logs: remover com mais de N dias (compliance LGPD = 1 ano)
  DELETE FROM whatsapp_bulk_dispatch_logs
  WHERE dispatched_at < NOW() - (p_bulk_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_bulk_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_outbox_deleted, v_bulk_deleted;
END;
$$ LANGUAGE plpgsql;

-- ── Função de limpeza de tokens expirados ───────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS BIGINT AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM messaging_variable_tokens
  WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION archive_old_messages IS
  'Job de retenção semanal (n8n). Remove registros expirados de messaging_outbox (90d) e whatsapp_bulk_dispatch_logs (365d). worker_status_history é permanente (auditoria regulatória).';

COMMENT ON FUNCTION cleanup_expired_tokens IS
  'Limpeza de tokens PII expirados em messaging_variable_tokens. Executar junto com archive_old_messages.';
