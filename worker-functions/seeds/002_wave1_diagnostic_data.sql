-- Seed 002: Wave 1 diagnostic data — exercita C1, C2-D e N8-C.
-- Idempotente: ON CONFLICT DO NOTHING.

-- =============================================================
-- Workers com whatsapp_phone_encrypted para diagnóstico C2-D
-- Valores em base64 (KMS test-mode passthrough)
-- =============================================================
UPDATE workers SET whatsapp_phone_encrypted = encode('11999990001'::bytea, 'base64')
WHERE id = 'a1b2c3d4-0001-0001-0001-000000000001';

UPDATE workers SET whatsapp_phone_encrypted = encode('11999990002'::bytea, 'base64')
WHERE id = 'a1b2c3d4-0001-0001-0001-000000000002';

-- Worker 3: whatsapp_phone_encrypted DIFERENTE de phone (simula caso divergente)
UPDATE workers SET whatsapp_phone_encrypted = encode('11888880003'::bytea, 'base64')
WHERE id = 'a1b2c3d4-0001-0001-0001-000000000003';

-- Worker extra: whatsapp_phone_encrypted NULL (simula worker sem WhatsApp)
INSERT INTO workers (
  id, auth_uid, email, phone, status, overall_status, country, timezone
) VALUES (
  'a1b2c3d4-0001-0001-0001-000000000004',
  'dev-worker-004',
  'carlos.gomez@dev.enlite',
  '11999990004',
  'approved',
  'ACTIVE',
  'AR',
  'America/Buenos_Aires'
)
ON CONFLICT (auth_uid) DO NOTHING;

-- Worker extra: whatsapp_phone_encrypted = phone (idêntico, base64-encoded)
INSERT INTO workers (
  id, auth_uid, email, phone, whatsapp_phone_encrypted, status, overall_status, country, timezone
) VALUES (
  'a1b2c3d4-0001-0001-0001-000000000005',
  'dev-worker-005',
  'lucia.fernandez@dev.enlite',
  '11999990005',
  encode('11999990005'::bytea, 'base64'),
  'in_progress',
  'QUALIFIED',
  'AR',
  'America/Buenos_Aires'
)
ON CONFLICT (auth_uid) DO NOTHING;

-- =============================================================
-- Job postings + applications para diagnóstico C1
-- =============================================================
INSERT INTO job_postings (
  id, title, description, status, country
) VALUES (
  'b2c3d4e5-0001-0001-0001-000000000001',
  'AT para caso pediátrico',
  'Acompanhante terapêutico para paciente pediátrico em Buenos Aires',
  'active',
  'AR'
),
(
  'b2c3d4e5-0001-0001-0001-000000000002',
  'Cuidador para caso geriátrico',
  'Cuidador domiciliar para paciente geriátrico',
  'active',
  'AR'
)
ON CONFLICT DO NOTHING;

INSERT INTO worker_job_applications (
  id, worker_id, job_posting_id, application_status
) VALUES (
  'c3d4e5f6-0001-0001-0001-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'b2c3d4e5-0001-0001-0001-000000000001',
  'applied'
),
(
  'c3d4e5f6-0001-0001-0001-000000000002',
  'a1b2c3d4-0001-0001-0001-000000000002',
  'b2c3d4e5-0001-0001-0001-000000000001',
  'shortlisted'
),
(
  'c3d4e5f6-0001-0001-0001-000000000003',
  'a1b2c3d4-0001-0001-0001-000000000003',
  'b2c3d4e5-0001-0001-0001-000000000002',
  'applied'
)
ON CONFLICT DO NOTHING;

-- =============================================================
-- Blacklist entries para diagnóstico N8-C
-- Simula diferentes tipos de reason para amostragem PII
-- =============================================================
INSERT INTO blacklist (
  id, worker_id, worker_raw_name, worker_raw_phone, reason, detail, registered_by
) VALUES
(
  'd4e5f6a7-0001-0001-0001-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Maria Silva',
  '11999990001',
  'No asistió al encuadre',
  'No se presentó a la entrevista programada',
  'coord-admin'
),
(
  'd4e5f6a7-0001-0001-0001-000000000002',
  'a1b2c3d4-0001-0001-0001-000000000002',
  'João Souza',
  '11999990002',
  'Abandono de paciente en crisis',
  'Dejó al paciente solo durante episodio de crisis. Familiar reportó situación al coordinador.',
  'coord-supervisor'
),
(
  'd4e5f6a7-0001-0001-0001-000000000003',
  'a1b2c3d4-0001-0001-0001-000000000003',
  'Ana Pereira',
  '11999990003',
  'Comportamiento inadecuado durante atendimiento',
  'Familiar del paciente denunció trato inapropiado. Se solicitó cambio inmediato.',
  'coord-supervisor'
),
(
  'd4e5f6a7-0001-0001-0001-000000000004',
  NULL,
  'Pedro Ramirez',
  '11777770001',
  'Documentación falsa',
  'Certificado de antecedentes no verificable',
  'coord-admin'
),
(
  'd4e5f6a7-0001-0001-0001-000000000005',
  NULL,
  'Laura Martinez',
  '11777770002',
  'No cumple requisitos mínimos',
  'Sin experiencia comprobable ni formación AT',
  'coord-admin'
)
ON CONFLICT DO NOTHING;
