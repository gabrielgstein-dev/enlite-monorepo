-- Migration 063: Adiciona content_sid à tabela de templates
--
-- Permite que um template referencie um Content Template pré-aprovado do Twilio.
-- Quando content_sid está preenchido, o TwilioMessagingService usa a Content API
-- (necessário para templates aprovados no WhatsApp Business).
-- Quando NULL, mantém comportamento atual: envia o campo `body` como texto livre.

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS content_sid VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN message_templates.content_sid IS
  'Twilio Content Template SID (HX...). Quando preenchido, o envio usa a Content API
   ignorando o campo body. Quando NULL, envia body como mensagem de texto.';

-- Template de completar cadastro — Content Template aprovado no WhatsApp Business
-- body é placeholder descritivo; não é enviado quando content_sid está definido.
INSERT INTO message_templates (slug, name, body, category, content_sid) VALUES (
  'complete_register_ofc',
  'Completar Cadastro (Oficial)',
  '[Template aprovado Twilio — conteúdo gerenciado via Content API]',
  'onboarding',
  'HXf7a25b327e14989f78e6d6d4572debc0'
)
ON CONFLICT (slug) DO UPDATE SET
  content_sid = EXCLUDED.content_sid,
  name        = EXCLUDED.name,
  category    = EXCLUDED.category,
  updated_at  = NOW();
