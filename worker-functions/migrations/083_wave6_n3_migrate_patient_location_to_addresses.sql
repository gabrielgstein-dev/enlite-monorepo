-- ============================================================
-- Migration 083 — Wave 6 / N3
-- Migrate patients inline location fields to patient_addresses
-- ============================================================
-- Columns deprecated: city_locality, province, zone_neighborhood
-- These are migrated to patient_addresses with address_type='primary'
-- for patients that don't already have a primary address entry.
-- ============================================================

BEGIN;

-- 1. Migrate inline data to patient_addresses (only for patients without primary address)
INSERT INTO patient_addresses (patient_id, address_type, address_raw, source)
SELECT
  p.id,
  'primary',
  CONCAT_WS(', ', p.zone_neighborhood, p.city_locality, p.province),
  'migration_083_from_inline'
FROM patients p
WHERE (p.city_locality IS NOT NULL OR p.province IS NOT NULL OR p.zone_neighborhood IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM patient_addresses pa
    WHERE pa.patient_id = p.id AND pa.address_type = 'primary'
  );

-- 2. Mark inline columns as DEPRECATED
COMMENT ON COLUMN patients.city_locality
  IS 'DEPRECATED (migration 083): usar patient_addresses com address_type=primary';
COMMENT ON COLUMN patients.province
  IS 'DEPRECATED (migration 083): usar patient_addresses com address_type=primary';
COMMENT ON COLUMN patients.zone_neighborhood
  IS 'DEPRECATED (migration 083): usar patient_addresses com address_type=primary';

COMMIT;
