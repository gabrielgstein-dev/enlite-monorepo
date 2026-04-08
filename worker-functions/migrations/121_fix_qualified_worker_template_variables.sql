-- Migration 121: Corrige template qualified_worker — 4 variáveis (sem links)
--
-- O template anterior tinha 7 variáveis (slot+link para cada opção + case_number),
-- mas o Content Template no Twilio só precisa dos horários + case_number.
-- Os meet_links são resolvidos pelo BookSlotFromWhatsAppUseCase quando o worker
-- escolhe o slot — não precisam estar no template da mensagem.
--
-- Variáveis posicionais do Content Template:
--   {{1}}=slot_1  {{2}}=slot_2  {{3}}=slot_3  {{4}}=case_number
--
-- Botões Quick Reply (IDs estáticos, não variáveis):
--   "Opción 1" → slot_1  |  "Opción 2" → slot_2  |  "Opción 3" → slot_3

UPDATE message_templates
SET body       = '{{slot_1}}{{slot_2}}{{slot_3}}{{case_number}}',
    content_sid = 'HX447312f3a5147c373d8326bae9654c53',
    updated_at  = NOW()
WHERE slug = 'qualified_worker';
