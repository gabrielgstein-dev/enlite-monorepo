-- Migration 089: N8-C — Encrypt blacklist.reason and blacklist.detail (PII clínico confirmado)
-- Severidade: CRÍTICA — Amostragem de produção confirmou conteúdo clínico sensível
-- (ex: "Abandono de paciente en crisis") que constitui PII sob LGPD/HIPAA.
--
-- Estratégia: adicionar colunas _encrypted, manter plaintext temporariamente
-- para migração de dados via KMS em batch (script separado).
-- Drop das colunas plaintext será feita em migration futura após confirmação
-- de que 100% dos dados foram migrados.

BEGIN;

-- Fase 1: Adicionar colunas encriptadas
ALTER TABLE blacklist
  ADD COLUMN IF NOT EXISTS reason_encrypted TEXT NULL,
  ADD COLUMN IF NOT EXISTS detail_encrypted TEXT NULL;

COMMENT ON COLUMN blacklist.reason_encrypted
  IS 'Motivo da blacklist — KMS encrypted (PII clínico confirmado, LGPD/HIPAA). Migration 089.';

COMMENT ON COLUMN blacklist.detail_encrypted
  IS 'Detalhe da blacklist — KMS encrypted (PII clínico confirmado, LGPD/HIPAA). Migration 089.';

COMMIT;
