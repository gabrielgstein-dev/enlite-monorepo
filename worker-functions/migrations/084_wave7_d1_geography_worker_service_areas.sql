-- Migration 084: D1 — geography em worker_service_areas
-- Descrição: Adiciona coluna geography gerada automaticamente a partir de lat/lng,
--            alinhando worker_service_areas (BR) com worker_locations (AR) que já
--            possui essa coluna desde migration 048.
-- Motivo: O matching geográfico com ST_DWithin funciona em worker_locations (AR)
--         mas não em worker_service_areas (BR) — gera bugs silenciosos.

-- Garantir PostGIS disponível
CREATE EXTENSION IF NOT EXISTS postgis;

-- Coluna geography gerada a partir de latitude/longitude existentes
ALTER TABLE worker_service_areas
ADD COLUMN IF NOT EXISTS location public.geography(point, 4326)
GENERATED ALWAYS AS (
  CASE
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL
    THEN ST_MakePoint(longitude::float8, latitude::float8)::geography
    ELSE NULL
  END
) STORED;

-- Índice GIST para queries ST_DWithin
CREATE INDEX IF NOT EXISTS idx_worker_service_areas_location
  ON worker_service_areas USING GIST (location)
  WHERE location IS NOT NULL;

COMMENT ON COLUMN worker_service_areas.location IS
  'Geography gerada automaticamente de latitude/longitude. Usar ST_DWithin para queries de proximidade. Alinhado com worker_locations.location (migration 048).';
