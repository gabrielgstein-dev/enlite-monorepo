-- Migration 048: Adicionar lat/lng e coluna geográfica a worker_locations
--
-- Permite filtrar workers por proximidade ao endereço de atendimento (job_postings.service_location)
-- usando ST_DWithin(worker_location, service_location, radius_meters).
--
-- Fonte dos dados: geocoding dos campos address / work_zone via Google Maps API.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE worker_locations
  ADD COLUMN IF NOT EXISTS lat      DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS lng      DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN lat IS NOT NULL AND lng IS NOT NULL
        THEN ST_MakePoint(lng, lat)::geography
      END
    ) STORED;

COMMENT ON COLUMN worker_locations.lat      IS 'Latitude geocodificada do endereço/zona do worker';
COMMENT ON COLUMN worker_locations.lng      IS 'Longitude geocodificada do endereço/zona do worker';
COMMENT ON COLUMN worker_locations.location IS 'Ponto geográfico gerado de lat/lng — usado para matchmaking por proximidade (ST_DWithin)';

CREATE INDEX IF NOT EXISTS idx_worker_locations_location
  ON worker_locations USING GIST (location)
  WHERE location IS NOT NULL;
