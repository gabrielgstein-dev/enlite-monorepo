-- Migration 086: D8 — Tokenização de variáveis PII em messaging_outbox
-- Descrição: Cria tabela messaging_variable_tokens para armazenar tokens
--            que substituem valores PII em messaging_outbox.variables.
-- Motivo: O campo variables JSONB é opaco para linters de PII. Templates
--         futuros com name/phone/location gravariam PII em plaintext sem controle.

CREATE TABLE IF NOT EXISTS messaging_variable_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      VARCHAR(64) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,  -- ex: 'worker_phone', 'worker_name'
  worker_id  UUID REFERENCES workers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para resolver tokens por valor
CREATE INDEX IF NOT EXISTS idx_mvt_token
  ON messaging_variable_tokens(token);

-- Índice para limpeza de tokens expirados (sem predicado — NOW() não é IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_mvt_expires_at
  ON messaging_variable_tokens(expires_at);

-- Índice para busca por worker
CREATE INDEX IF NOT EXISTS idx_mvt_worker_id
  ON messaging_variable_tokens(worker_id);

COMMENT ON TABLE messaging_variable_tokens IS
  'Tokens temporários (TTL 24h) que substituem valores PII em messaging_outbox.variables. O MessagingService resolve o token → valor real no momento do envio, nunca armazenando PII no JSONB.';
