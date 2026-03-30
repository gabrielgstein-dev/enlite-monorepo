-- Tabela de autorizacao de parceiros para webhooks.
-- A validacao da API Key e feita via Google API (apikeys.lookupKey).
-- Esta tabela mapeia o displayName da key (vindo do GCP) a paths permitidos.
CREATE TABLE IF NOT EXISTS webhook_partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) UNIQUE NOT NULL,      -- ex: 'talentum', 'anacare'
  display_name  VARCHAR(200) NOT NULL,             -- display name da API Key no GCP (ex: 'API-Key-Talentum')
  allowed_paths TEXT[] NOT NULL DEFAULT '{}',       -- ex: ARRAY['talentum/*']
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB DEFAULT '{}',                -- contato, notas, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index unico no display_name (usado no lookup apos validacao Google)
CREATE UNIQUE INDEX idx_webhook_partners_display_name ON webhook_partners(display_name);

-- Seed do parceiro Talentum (producao)
INSERT INTO webhook_partners (name, display_name, allowed_paths, metadata)
VALUES (
  'talentum',
  'API-Key-Talentum',
  ARRAY['talentum/*'],
  '{"contact": "talentum-team"}'::jsonb
) ON CONFLICT (name) DO NOTHING;
