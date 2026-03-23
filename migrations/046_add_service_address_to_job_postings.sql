-- Migration 046: Endereço de atendimento em job_postings + PostGIS
--
-- Um paciente pode ter múltiplas vagas em endereços diferentes (casa, escola,
-- casa da mãe). O endereço de atendimento pertence à vaga, não ao paciente.
--
-- Fonte: campo "Domicilio 1 Principal Paciente" do ClickUp (= local do atendimento
-- para aquele caso específico).
--
-- Colunas adicionadas:
--   service_address_formatted → location field do ClickUp (formatado pelo Google Maps)
--   service_address_raw       → short text do ClickUp (texto livre da coordenadora)
--   service_lat / service_lng → populados por geocoding (Google Maps API, futuro)
--   service_location          → GEOGRAPHY gerada automaticamente de lat/lng

-- ── 1. Habilitar PostGIS ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── 2. Colunas de endereço e geocoding ────────────────────────────────────────
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS service_address_formatted TEXT,
  ADD COLUMN IF NOT EXISTS service_address_raw       TEXT,
  ADD COLUMN IF NOT EXISTS service_lat               DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS service_lng               DECIMAL(11, 8);

-- ── 3. Coluna geográfica gerada a partir de lat/lng ───────────────────────────
-- Gerada automaticamente quando lat/lng forem populados pelo geocoding.
-- Permite queries como: ST_DWithin(service_location, worker_location, 5000)
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS service_location GEOGRAPHY(POINT, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN service_lat IS NOT NULL AND service_lng IS NOT NULL
      THEN ST_MakePoint(service_lng, service_lat)::geography
    END
  ) STORED;

-- ── 4. Índice espacial para matchmaking por proximidade ───────────────────────
CREATE INDEX IF NOT EXISTS idx_job_postings_service_location
  ON job_postings USING GIST (service_location)
  WHERE service_location IS NOT NULL;

COMMENT ON COLUMN job_postings.service_address_formatted IS 'Endereço de atendimento formatado pelo Google Maps (Domicilio 1 Principal Paciente - location field do ClickUp)';
COMMENT ON COLUMN job_postings.service_address_raw       IS 'Endereço de atendimento em texto livre (Domicilio Informado Paciente 1 - short text do ClickUp)';
COMMENT ON COLUMN job_postings.service_lat               IS 'Latitude do endereço de atendimento — populado por geocoding via Google Maps API';
COMMENT ON COLUMN job_postings.service_lng               IS 'Longitude do endereço de atendimento — populado por geocoding via Google Maps API';
COMMENT ON COLUMN job_postings.service_location          IS 'Ponto geográfico gerado de service_lat/lng — usado para matchmaking por proximidade (ST_DWithin)';

DO $$ BEGIN RAISE NOTICE 'Migration 046 concluída: PostGIS habilitado + service_address + service_location em job_postings'; END $$;
