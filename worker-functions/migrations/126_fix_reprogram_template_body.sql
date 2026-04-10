-- Fix: body usava {{1}} (posicional) em vez de {{case_number}} (nomeado)
UPDATE message_templates
SET body = '¡Perfecto! Entendemos que a veces los tiempos no se acomodan y no hay ningún problema. 😊

Tu solicitud de reagendamiento para el caso {{case_number}} quedó registrada.

En cuanto se abran las nuevas agendas para este caso, te enviaremos un mensaje con las opciones de día y horario para que puedas elegir el que más te convenga.

¡Gracias por tu interés y por seguir siendo parte de este proceso! 💛'
WHERE slug = 'qualified_reprogram_confirm';
