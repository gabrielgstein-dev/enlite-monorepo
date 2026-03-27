-- Migration 059: Tabela de templates de mensagens WhatsApp
-- Desacopla o conteúdo das mensagens do código. Todo envio via IMessagingService
-- referencia um slug — nunca texto livre — garantindo rastreabilidade e compliance LGPD.

CREATE TABLE message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(100) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,          -- ex: 'Olá {{name}}, encontramos uma vaga...'
  category    VARCHAR(50),            -- 'onboarding' | 'recruitment' | 'notification'
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Templates iniciais
INSERT INTO message_templates (slug, name, body, category) VALUES
  ('talent_search_welcome',
   'Boas-vindas Talent Search',
   'Olá {{name}}! Encontramos o seu perfil e gostaríamos de apresentar oportunidades na área da saúde. Podemos conversar?',
   'onboarding'),

  ('vacancy_match',
   'Vaga Compatível',
   'Olá {{name}}! Temos uma vaga de {{role}} em {{location}} que combina com o seu perfil. Tem interesse?',
   'recruitment'),

  ('encuadre_scheduled',
   'Entrevista Agendada',
   'Olá {{name}}! Sua entrevista foi agendada para {{date}} às {{time}}. Confirma presença?',
   'notification');
