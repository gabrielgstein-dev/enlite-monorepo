-- 039_remove_patient_fields_from_job_postings.sql
--
-- Remove de job_postings os campos que pertencem ao paciente.
-- Esses dados agora vivem em patients (migration 037) e são acessados
-- via job_postings.patient_id → patients.
--
-- Campos removidos:
--   diagnosis          → patients.diagnosis
--   patient_zone       → patients.zone_neighborhood
--   patient_neighborhood → patients.city_locality

ALTER TABLE job_postings
  DROP COLUMN IF EXISTS diagnosis,
  DROP COLUMN IF EXISTS patient_zone,
  DROP COLUMN IF EXISTS patient_neighborhood;
