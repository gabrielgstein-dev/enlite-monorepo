-- Migration 090: N8 — Adicionar COMMENTs nos campos _raw de encuadres e blacklist
-- Severidade: BAIXA — documentação incompleta
--
-- Apenas service_address_raw em job_postings tinha COMMENT.
-- Os campos _raw são audit trail somente leitura — dados originais antes da normalização.

BEGIN;

-- encuadres._raw fields
COMMENT ON COLUMN encuadres.worker_raw_name
  IS 'Nome original do worker como recebido na planilha/import. Somente leitura — audit trail. Não usar para lógica de negócio.';

COMMENT ON COLUMN encuadres.worker_raw_phone
  IS 'Telefone original do worker como recebido na planilha/import. Somente leitura — audit trail. Não usar para lógica de negócio.';

COMMENT ON COLUMN encuadres.occupation_raw
  IS 'Ocupação original como recebida na planilha/import antes da normalização. Somente leitura — audit trail.';

-- blacklist._raw fields
COMMENT ON COLUMN blacklist.worker_raw_name
  IS 'Nome original do worker como recebido na planilha/import. Somente leitura — audit trail. Não usar para lógica de negócio.';

COMMENT ON COLUMN blacklist.worker_raw_phone
  IS 'Telefone original do worker como recebido na planilha/import. Somente leitura — audit trail. Não usar para lógica de negócio.';

COMMIT;
