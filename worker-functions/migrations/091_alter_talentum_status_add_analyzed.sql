-- 091_alter_talentum_status_add_analyzed.sql
--
-- Adiciona o status 'ANALYZED' ao CHECK constraint da tabela talentum_prescreenings.
-- O status ANALYZED é usado quando o prescreening foi processado/analisado após
-- ser completado pelo candidato no app Talentum.
--
-- Contexto: A migration 057 criou o CHECK com ('INITIATED', 'IN_PROGRESS', 'COMPLETED').
-- Este script altera o constraint para incluir 'ANALYZED'.

-- Remover constraint existente (se houver)
ALTER TABLE talentum_prescreenings
DROP CONSTRAINT IF EXISTS talentum_prescreenings_status_check;

-- Adicionar novo constraint com o status ANALYZED incluído
ALTER TABLE talentum_prescreenings
ADD CONSTRAINT talentum_prescreenings_status_check
  CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED'));

COMMENT ON CONSTRAINT talentum_prescreenings_status_check ON talentum_prescreenings IS
  'Status do prescreening: INITIATED (iniciado), IN_PROGRESS (em andamento), COMPLETED (completado pelo candidato), ANALYZED (processado/analisado pela equipe).';
