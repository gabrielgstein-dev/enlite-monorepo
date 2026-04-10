-- Template de agradecimento ao worker que declinou (free-form, sem content_sid)
INSERT INTO message_templates (slug, name, category, body)
VALUES (
  'qualified_declined_thanks',
  'Agradecimento por resposta de declínio',
  'UTILITY',
  '¡Muchas gracias por tu respuesta! Valoramos mucho tu tiempo y tu honestidad. 💛

Te deseamos lo mejor y esperamos poder contar con vos en el futuro. ¡Éxitos!'
)
ON CONFLICT (slug) DO UPDATE SET body = EXCLUDED.body;
