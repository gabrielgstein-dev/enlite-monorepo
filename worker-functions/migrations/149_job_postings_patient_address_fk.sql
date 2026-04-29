BEGIN;

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS patient_address_id UUID
    REFERENCES patient_addresses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_job_postings_patient_address_id
  ON job_postings(patient_address_id)
  WHERE patient_address_id IS NOT NULL;

-- Deprecation notices (data still lives here for rollback; drops happen in Phase 9)
COMMENT ON COLUMN job_postings.state IS
  'DEPRECATED (migration 149): use patient_addresses.state via patient_address_id FK';
COMMENT ON COLUMN job_postings.city IS
  'DEPRECATED (migration 149): use patient_addresses.city via patient_address_id FK';
COMMENT ON COLUMN job_postings.service_address_formatted IS
  'DEPRECATED (migration 149): use patient_addresses.address_formatted via patient_address_id FK';
COMMENT ON COLUMN job_postings.service_address_raw IS
  'DEPRECATED (migration 149): use patient_addresses.address_raw via patient_address_id FK';
COMMENT ON COLUMN job_postings.service_device_types IS
  'DEPRECATED (migration 149): service device types belong to patient record';
COMMENT ON COLUMN job_postings.pathology_types IS
  'DEPRECATED (migration 149): use patients.diagnosis via patient_id FK';
COMMENT ON COLUMN job_postings.dependency_level IS
  'DEPRECATED (migration 149): use patients.dependency_level via patient_id FK';

COMMIT;
