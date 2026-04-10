-- Migration 124: Set content_sid for qualified_reminder_confirm template
-- Template created via Twilio Content API with quick-reply buttons (Sí/No)
-- Content SID: HXcfcca88f4fc5ec4e00663ed8dd303a8b

UPDATE message_templates
SET content_sid = 'HXcfcca88f4fc5ec4e00663ed8dd303a8b',
    body = '¡Hola {{name}}! Mañana {{date}} a las {{time}} tenés tu entrevista. ¿Vas a participar?'
WHERE slug = 'qualified_reminder_confirm';

DO $$ BEGIN
  RAISE NOTICE 'Migration 124 done: qualified_reminder_confirm content_sid set.';
END $$;
