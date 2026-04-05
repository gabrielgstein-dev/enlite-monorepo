-- Migration 110: Add neighborhood column to worker_service_areas
-- Descrição: Adiciona coluna neighborhood (bairro) à tabela worker_service_areas
--            para armazenar o bairro do endereço de atendimento do prestador.

ALTER TABLE worker_service_areas
  ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(150);

COMMENT ON COLUMN worker_service_areas.neighborhood IS
  'Bairro do endereço de atendimento. Campo opcional, preenchido via geocoding reverso ou digitação manual.';
