-- Distingue dados de teste (webhooks-test/) de producao (webhooks/)
ALTER TABLE talentum_prescreenings
  ADD COLUMN IF NOT EXISTS environment VARCHAR(20) NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'test'));

COMMENT ON COLUMN talentum_prescreenings.environment IS
  'Distingue dados de teste (webhooks-test/) de producao (webhooks/)';
