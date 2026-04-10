-- Template de confirmação de reagendamento (REPROGRAM)
INSERT INTO message_templates (slug, content_sid, name, category, body)
VALUES (
  'qualified_reprogram_confirm',
  'HXf07d6a0407ae68ccd1b402e82b32b1a8',
  'Confirmação de reagendamento',
  'UTILITY',
  '¡Perfecto! Entendemos que a veces los tiempos no se acomodan y no hay ningún problema. 😊

Tu solicitud de reagendamiento para el caso {{case_number}} quedó registrada.

En cuanto se abran las nuevas agendas para este caso, te enviaremos un mensaje con las opciones de día y horario para que puedas elegir el que más te convenga.

¡Gracias por tu interés y por seguir siendo parte de este proceso! 💛'
)
ON CONFLICT (slug) DO UPDATE SET content_sid = EXCLUDED.content_sid, body = EXCLUDED.body;
