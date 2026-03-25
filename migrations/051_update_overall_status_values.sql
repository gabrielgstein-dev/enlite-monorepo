-- Migration 051: Atualizar constraint de overall_status com todos os valores do funil Talentum
--
-- Funil completo:
--   PRE_TALENTUM  → iniciou registro mas não terminou
--   QUALIFIED     → Talentum confirmou que é o perfil buscado para aquele paciente
--   IN_DOUBT      → Talentum tem dúvidas sobre o perfil
--   MESSAGE_SENT  → mensagem enviada para subir documentação (pós QUALIFIED/IN_DOUBT)
--   ACTIVE        → completou todo o processo
--   INACTIVE      → desligado
--   BLACKLISTED   → bloqueado

ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS workers_overall_status_check;

ALTER TABLE workers
  ADD CONSTRAINT workers_overall_status_check
  CHECK (overall_status IN (
    'PRE_TALENTUM',
    'QUALIFIED',
    'IN_DOUBT',
    'MESSAGE_SENT',
    'ACTIVE',
    'INACTIVE',
    'BLACKLISTED',
    'HIRED'
  ));
