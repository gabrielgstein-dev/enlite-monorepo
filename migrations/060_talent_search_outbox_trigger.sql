-- Migration 060: Outbox de mensagens + trigger talent_search_welcome
-- Desacopla o evento PostgreSQL do envio HTTP (trigger síncrono não pode fazer IO).

-- ── Tabela de outbox ──────────────────────────────────────────────────────────

CREATE TABLE messaging_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID NOT NULL REFERENCES workers(id),
  template_slug VARCHAR(100) NOT NULL,
  variables     JSONB NOT NULL DEFAULT '{}',
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts      INT NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

-- Índice parcial: apenas registros pending; evita full scan no polling
CREATE INDEX idx_messaging_outbox_pending
  ON messaging_outbox(status, created_at)
  WHERE status = 'pending';

-- ── Função + trigger: talent_search_welcome ───────────────────────────────────
-- Dispara quando 'talent_search' é adicionado a data_sources pela 1ª vez.
-- Usa INSERT ... ON CONFLICT DO NOTHING para ser idempotente em re-runs.

CREATE OR REPLACE FUNCTION fn_queue_talent_search_welcome()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.data_sources @> ARRAY['talent_search']::text[]
    AND (OLD IS NULL OR NOT OLD.data_sources @> ARRAY['talent_search']::text[])
  ) THEN
    INSERT INTO messaging_outbox (worker_id, template_slug, variables)
    VALUES (
      NEW.id,
      'talent_search_welcome',
      -- full_name foi removido na migration 023 (PII encrypted).
      -- O template usa 'Profissional' como fallback genérico.
      jsonb_build_object('name', 'Profissional')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_talent_search_welcome
  AFTER INSERT OR UPDATE OF data_sources ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_queue_talent_search_welcome();
