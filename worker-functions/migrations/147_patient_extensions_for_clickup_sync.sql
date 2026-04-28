BEGIN;

-- ================================================================
-- Migration 147: patient_addresses extensions + patients.status ADMISSION
--                + patients health insurance fields
-- ================================================================
-- Context: Sprint refactor de vagas — Fase 1 (SPRINT_VACANCIES_REFACTOR.md)
--
-- 1. patient_addresses: state, city, neighborhood
--    (parsed from ClickUp "Provincia del Paciente", "Ciudad / Localidad del Paciente",
--     "Zona o Barrio Paciente")
--
-- 2. patients: health_insurance_name + health_insurance_member_id
--    (ClickUp: "Cobertura Informada", "Número ID Afiliado Paciente")
--    TODO: migrate to patient_health_insurance table when more insurance fields appear
--
-- 3. patients.status CHECK constraint: add ADMISSION as 6th canonical value
--    ADMISSION = patient sent from ClickUp status "admisión" (pre-onboarding,
--    no job posting created yet). Distinct from PENDING_ADMISSION (waiting for docs).
--    Migration 143 created the inline CHECK (auto-named patients_status_check).
--    Pattern: rename → _deprecated_ → drop → recreate with new value.
--
-- NOTE: patients.province / patients.city_locality / patients.zone_neighborhood
-- are DEPRECATED since migration 083. New location data goes into patient_addresses
-- (with state/city/neighborhood columns added here).
-- ================================================================

-- ── 1. patient_addresses: add state, city, neighborhood ─────��────────────────

ALTER TABLE patient_addresses
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT;

COMMENT ON COLUMN patient_addresses.state IS
  'Provincia do paciente (ClickUp: "Provincia del Paciente", location field). Extraída do formatted_address ou address_components do Google Maps. Fill-only via sync ClickUp.';
COMMENT ON COLUMN patient_addresses.city IS
  'Ciudad / Localidad do paciente (ClickUp: "Ciudad / Localidad del Paciente", location field). Fill-only via sync ClickUp.';
COMMENT ON COLUMN patient_addresses.neighborhood IS
  'Zona o Barrio do paciente (ClickUp: "Zona o Barrio Paciente", short_text). Texto livre do operador, não derivado do endereço geocodificado. Fill-only via sync ClickUp.';

-- ── 2. patients: health insurance fields ─────────────────────────���───────────

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS health_insurance_name TEXT,
  ADD COLUMN IF NOT EXISTS health_insurance_member_id TEXT;

COMMENT ON COLUMN patients.health_insurance_name IS
  'Cobertura informada (ClickUp: "Cobertura Informada"). Fill-only via sync ClickUp. TODO: migrar para tabela patient_health_insurance separada quando houver mais campos de plano.';
COMMENT ON COLUMN patients.health_insurance_member_id IS
  'Numero ID afiliado (ClickUp: "Número ID Afiliado Paciente"). Fill-only via sync ClickUp. TODO: migrar para tabela patient_health_insurance separada.';

-- ── 3. patients.status: expand CHECK constraint with ADMISSION ───────────────
-- Migration 143 added an inline CHECK (auto-named patients_status_check).
-- Pattern: rename to _deprecated_ → drop _deprecated_ → recreate with 6 values.

ALTER TABLE patients
  RENAME CONSTRAINT patients_status_check
      TO patients_status_check_deprecated_20260427;

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_status_check_deprecated_20260427;

ALTER TABLE patients
  ADD CONSTRAINT patients_status_check
  CHECK (status IS NULL OR status IN (
    'PENDING_ADMISSION',
    'ACTIVE',
    'SUSPENDED',
    'DISCONTINUED',
    'DISCHARGED',
    'ADMISSION'
  ));

COMMENT ON CONSTRAINT patients_status_check ON patients IS
  'Canonical status values for patient lifecycle. ADMISSION added in migration 147 for ClickUp status "admisión" (patient in onboarding, no vacancy yet). PENDING_ADMISSION = awaiting docs/authorizations. First 5 values established in migration 143.';

COMMIT;
