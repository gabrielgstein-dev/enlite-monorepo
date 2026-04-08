-- Migration 118: Corrige chave única de talentum_prescreenings
--
-- Problema: prescreening.id do Talentum identifica a FILA (processo seletivo da vaga),
-- não o candidato. Vários candidatos compartilham o mesmo prescreening.id.
-- Com a unique key apenas em talentum_prescreening_id, o segundo candidato
-- sobrescrevia o primeiro via upsert.
--
-- Fix: chave composta (talentum_prescreening_id, talentum_profile_id)
-- = um registro por candidato por fila.
--
-- Justificativa para remoção da constraint antiga: a constraint
-- talentum_prescreenings_talentum_prescreening_id_key impede múltiplos candidatos
-- na mesma fila. Não é deprecação de coluna/tabela — é substituição de constraint
-- por uma mais correta (composta). A coluna e os dados permanecem intactos.

BEGIN;

-- 1. Renomear constraint antiga (prescreening_id sozinho não é unique)
ALTER TABLE talentum_prescreenings
  RENAME CONSTRAINT talentum_prescreenings_talentum_prescreening_id_key
  TO talentum_prescreenings_prescreening_id_deprecated_20260408;

-- 2. Remover a constraint deprecated
ALTER TABLE talentum_prescreenings
  DROP CONSTRAINT talentum_prescreenings_prescreening_id_deprecated_20260408;

-- 3. Criar constraint composta (prescreening_id + profile_id)
ALTER TABLE talentum_prescreenings
  ADD CONSTRAINT talentum_prescreenings_prescreening_profile_unique
  UNIQUE (talentum_prescreening_id, talentum_profile_id);

COMMIT;
