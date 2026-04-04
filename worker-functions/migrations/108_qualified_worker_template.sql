-- Migration 108: Template qualified_worker para mensagem de qualificação
--
-- Template Twilio com 3 botões (opções de entrevista) + case_number no body.
-- Variáveis posicionais: {{1}}=slot_1 {{2}}=link_1 {{3}}=slot_2 {{4}}=link_2
--                        {{5}}=slot_3 {{6}}=link_3 {{7}}=case_number
--
-- O body abaixo serve apenas para mapToContentVariables() converter
-- variáveis nomeadas → posicionais na ordem correta.
-- O texto real da mensagem vive no Content Template do Twilio (content_sid).

INSERT INTO message_templates (slug, name, body, category, content_sid)
VALUES (
  'qualified_worker',
  'Worker Qualificado — Convite Entrevista',
  '{{slot_1}}{{link_1}}{{slot_2}}{{link_2}}{{slot_3}}{{link_3}}{{case_number}}',
  'recruitment',
  'HX1a4188493b5fdf099aab812c9c9cfa99'
)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  body       = EXCLUDED.body,
  category   = EXCLUDED.category,
  updated_at = NOW();
