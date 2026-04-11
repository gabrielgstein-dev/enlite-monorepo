-- 129_expand_prescreening_status_check.sql
--
-- Expande o CHECK constraint da coluna status em talentum_prescreenings
-- para incluir os valores do statusLabel do Talentum (QUALIFIED, NOT_QUALIFIED, IN_DOUBT).
--
-- Contexto: O commit dcb219b passou a gravar o statusLabel diretamente na coluna status
-- quando subtype=ANALYZED, mas a migration 091 só permitia INITIATED/IN_PROGRESS/COMPLETED/ANALYZED.
-- PENDING também é necessário: a linha 210 só mapeia para funnel stage (deriveFunnelStage),
-- mas persistPrescreening (linha 162) grava o statusLabel diretamente no status.

-- Depreca constraint antiga e remove (RENAME sozinho não desabilita CHECK)
ALTER TABLE talentum_prescreenings
RENAME CONSTRAINT talentum_prescreenings_status_check
    TO talentum_prescreenings_status_check_deprecated_20260411;

ALTER TABLE talentum_prescreenings
DROP CONSTRAINT IF EXISTS talentum_prescreenings_status_check_deprecated_20260411;

-- Cria constraint expandida
ALTER TABLE talentum_prescreenings
ADD CONSTRAINT talentum_prescreenings_status_check
  CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED', 'QUALIFIED', 'NOT_QUALIFIED', 'IN_DOUBT', 'PENDING'));
