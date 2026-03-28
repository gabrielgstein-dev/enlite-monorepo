-- ============================================================
-- Migration 064: Update profession enum to new values
--
-- New profession values:
--   AT (Acompañante Terapéutico)
--   CAREGIVER (Cuidador/a)
--   NURSE (Enfermera/o)
--   KINESIOLOGIST (Kinesióloga/o)
--   PSYCHOLOGIST (Psicóloga/o)
-- ============================================================

-- 1. Migrate existing profession data to new values
UPDATE workers SET profession = 'CAREGIVER'    WHERE profession IN ('CARER', 'caregiver');
UPDATE workers SET profession = 'NURSE'         WHERE profession = 'nurse';
UPDATE workers SET profession = 'PSYCHOLOGIST'  WHERE profession = 'psychologist';
UPDATE workers SET profession = 'KINESIOLOGIST' WHERE profession = 'physiotherapist';
UPDATE workers SET profession = NULL            WHERE profession IN ('STUDENT', 'BOTH');

-- 2. Drop old profession constraint
ALTER TABLE workers DROP CONSTRAINT IF EXISTS valid_profession_values;

-- 3. Add new profession constraint
ALTER TABLE workers
  ADD CONSTRAINT valid_profession_values
  CHECK (profession IS NULL OR profession IN ('AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'));

-- 4. Update job_postings constraint
UPDATE job_postings SET required_profession = 'CAREGIVER'    WHERE required_profession IN ('CARER', 'caregiver');
UPDATE job_postings SET required_profession = 'NURSE'         WHERE required_profession = 'nurse';
UPDATE job_postings SET required_profession = 'PSYCHOLOGIST'  WHERE required_profession = 'psychologist';
UPDATE job_postings SET required_profession = 'KINESIOLOGIST' WHERE required_profession = 'physiotherapist';
UPDATE job_postings SET required_profession = NULL            WHERE required_profession IN ('STUDENT', 'BOTH');

ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS valid_required_profession;

ALTER TABLE job_postings
  ADD CONSTRAINT valid_required_profession
  CHECK (required_profession IS NULL OR required_profession IN ('AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'));

COMMENT ON CONSTRAINT valid_profession_values ON workers IS
  'Profession must be one of: AT (Acompañante Terapéutico), CAREGIVER (Cuidador/a), NURSE (Enfermera/o), KINESIOLOGIST (Kinesióloga/o), PSYCHOLOGIST (Psicóloga/o)';
