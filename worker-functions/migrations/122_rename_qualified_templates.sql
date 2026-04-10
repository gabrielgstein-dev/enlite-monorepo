-- Migration 122: Renomeia templates qualified para novos slugs
--
-- qualified_worker          → qualified_worker_request  (novo Content SID aprovado)
-- qualified_slot_confirmed  → qualified_worker_response (novo Content SID com texto enxuto)
--
-- O qualified_worker_request reestrutura a mensagem (horários no topo, contexto embaixo).
-- O qualified_worker_response é uma confirmação curta pedindo que verifique o email (Google Calendar).
--
-- Variáveis posicionais:
--   qualified_worker_request:  {{1}}=slot_1 {{2}}=slot_2 {{3}}=slot_3 {{4}}=case_number
--   qualified_worker_response: {{1}}=date   {{2}}=time

-- 1. qualified_worker → qualified_worker_request
UPDATE message_templates
SET slug        = 'qualified_worker_request',
    content_sid = 'HX13ee9b7c406830e7eda764a052700c42',
    updated_at  = NOW()
WHERE slug = 'qualified_worker';

-- 2. qualified_slot_confirmed → qualified_worker_response
UPDATE message_templates
SET slug        = 'qualified_worker_response',
    name        = 'Worker Qualificado — Confirmação Entrevista',
    body        = '{{date}}{{time}}',
    content_sid = 'HXed69d4daca5e063902af3177c5ebca5d',
    updated_at  = NOW()
WHERE slug = 'qualified_slot_confirmed';
