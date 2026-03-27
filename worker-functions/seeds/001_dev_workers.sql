-- Dev seed: Workers de exemplo para desenvolvimento local.
-- Idempotente: ON CONFLICT DO NOTHING garante segurança em re-execuções.
-- auth_uid usa prefixo "dev-" para identificar facilmente dados de seed.

INSERT INTO workers (
  id,
  auth_uid,
  email,
  phone,
  status,
  overall_status,
  country,
  timezone
) VALUES
  (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'dev-worker-001',
    'maria.silva@dev.enlite',
    '11999990001',
    'approved',
    'ACTIVE',
    'AR',
    'America/Buenos_Aires'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000002',
    'dev-worker-002',
    'joao.souza@dev.enlite',
    '11999990002',
    'in_progress',
    'QUALIFIED',
    'AR',
    'America/Buenos_Aires'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000003',
    'dev-worker-003',
    'ana.pereira@dev.enlite',
    '11999990003',
    'review',
    'QUALIFIED',
    'AR',
    'America/Buenos_Aires'
  )
ON CONFLICT (auth_uid) DO NOTHING;
