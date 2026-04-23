-- Migration 139 — Canonicalize patient enum columns (UPPERCASE EN).
-- Aligns patient schema with rule feedback_enum_values_english_uppercase.md.
-- Replaces Spanish/mixed-case free-text values with CHECK-constrained canonicals.

-- ─── 1. service_type: TEXT → TEXT[] (array de Profession) ────────────────
-- Motivo: paciente pode precisar de múltiplos tipos de prestador (AT + CAREGIVER).
-- Alinha com job_postings.required_profession (já é TEXT[] desde migration 053).

-- 1a. Normaliza valores existentes ANTES de mudar o tipo (só se a coluna ainda for TEXT)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'patients' AND column_name = 'service_type') = 'text' THEN
    UPDATE patients SET service_type = 'AT'           WHERE service_type = 'Acompañante Terapéutico';
    UPDATE patients SET service_type = 'CAREGIVER'    WHERE service_type IN ('Cuidador', 'Cuidador (a)', 'Cuidador(a)');
    UPDATE patients SET service_type = 'PSYCHOLOGIST' WHERE service_type IN ('Psicólogo', 'Psicólogo (a)', 'Psicólogo(a)');
    UPDATE patients SET service_type = 'AT,CAREGIVER' WHERE service_type = 'AT y Cuidador';
  END IF;
END;
$$;

-- 1b. Converte pra TEXT[] (idempotente: só executa se ainda for TEXT)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'patients' AND column_name = 'service_type') = 'text' THEN
    ALTER TABLE patients
      ALTER COLUMN service_type TYPE TEXT[] USING
        CASE
          WHEN service_type IS NULL THEN NULL
          WHEN service_type = 'AT,CAREGIVER' THEN ARRAY['AT', 'CAREGIVER']
          ELSE ARRAY[service_type]
        END;
  END IF;
END;
$$;

-- 1c. CHECK constraint (idempotente via exception)
DO $$
BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_service_type_check
    CHECK (service_type IS NULL OR service_type <@ ARRAY['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST']::TEXT[]);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN patients.service_type IS
  'Profissionais que o paciente precisa. Canonical = worker.profession enum (migration 064).';

-- ─── 2. clinical_specialty: nova coluna ──────────────────────────────────

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS clinical_specialty TEXT NULL;

DO $$
BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_clinical_specialty_check
    CHECK (clinical_specialty IS NULL OR clinical_specialty IN (
      'INTELLECTUAL_DISABILITY',
      'NEUROLOGICAL',
      'MOTOR_LIMITATIONS',
      'ASD',
      'PSYCHIATRIC',
      'SOCIAL_VULNERABILITY',
      'GERIATRIC',
      'SPECIFIC_PATHOLOGY',
      'CUSTOM'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN patients.clinical_specialty IS
  'Especialidade clínica do paciente (dimensão independente de service_type). Preenchido a partir de ClickUp "Segmentos Clínicos".';

-- ─── 3. dependency_level: normalize values + CHECK ───────────────────────

UPDATE patients SET dependency_level = 'SEVERE'      WHERE dependency_level = 'GRAVE';
UPDATE patients SET dependency_level = 'VERY_SEVERE' WHERE dependency_level IN ('MUY GRAVE', 'MUY_GRAVE');
UPDATE patients SET dependency_level = 'MODERATE'    WHERE dependency_level = 'MODERADA';
UPDATE patients SET dependency_level = 'MILD'        WHERE dependency_level = 'LEVE';
-- Se houver qualquer valor não mapeado, seta NULL para preservar constraint
UPDATE patients SET dependency_level = NULL
  WHERE dependency_level IS NOT NULL
    AND dependency_level NOT IN ('SEVERE','VERY_SEVERE','MODERATE','MILD');

DO $$
BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_dependency_level_check
    CHECK (dependency_level IS NULL OR dependency_level IN ('SEVERE','VERY_SEVERE','MODERATE','MILD'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ─── 4. sex: normalize values + CHECK ────────────────────────────────────

UPDATE patients SET sex = 'FEMALE'      WHERE sex IN ('Femenino', 'Feminino', 'F');
UPDATE patients SET sex = 'MALE'        WHERE sex IN ('Masculino', 'M');
UPDATE patients SET sex = 'INTERSEX'    WHERE sex = 'Intersex';
UPDATE patients SET sex = 'UNDISCLOSED' WHERE sex IN ('Prefiero no decir', 'Outro', 'Otro');
UPDATE patients SET sex = NULL
  WHERE sex IS NOT NULL AND sex NOT IN ('FEMALE','MALE','INTERSEX','UNDISCLOSED');

DO $$
BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_sex_check
    CHECK (sex IS NULL OR sex IN ('FEMALE','MALE','INTERSEX','UNDISCLOSED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ─── 5. document_type: normalize + CHECK ─────────────────────────────────

UPDATE patients SET document_type = 'PASSPORT' WHERE document_type IN ('Passaporte', 'Pasaporte', 'Passport');
UPDATE patients SET document_type = 'CEDULA'   WHERE document_type IN ('Cédula', 'Cedula');
UPDATE patients SET document_type = 'LE_LC'    WHERE document_type = 'LE/LC';
UPDATE patients SET document_type = NULL
  WHERE document_type IS NOT NULL AND document_type NOT IN ('DNI','PASSPORT','CEDULA','LE_LC','CPF');

DO $$
BEGIN
  ALTER TABLE patients
    ADD CONSTRAINT patients_document_type_check
    CHECK (document_type IS NULL OR document_type IN ('DNI','PASSPORT','CEDULA','LE_LC','CPF'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ─── 6. patient_responsibles.document_type: mesmo tratamento ──────────────

UPDATE patient_responsibles SET document_type = 'PASSPORT' WHERE document_type IN ('Passaporte', 'Pasaporte');
UPDATE patient_responsibles SET document_type = 'CEDULA'   WHERE document_type IN ('Cédula', 'Cedula');
UPDATE patient_responsibles SET document_type = 'LE_LC'    WHERE document_type = 'LE/LC';
UPDATE patient_responsibles SET document_type = NULL
  WHERE document_type IS NOT NULL AND document_type NOT IN ('DNI','PASSPORT','CEDULA','LE_LC','CPF');

DO $$
BEGIN
  ALTER TABLE patient_responsibles
    ADD CONSTRAINT patient_responsibles_document_type_check
    CHECK (document_type IS NULL OR document_type IN ('DNI','PASSPORT','CEDULA','LE_LC','CPF'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ─── 7. patient_responsibles.relationship: CHECK ──────────────────────────

DO $$
BEGIN
  ALTER TABLE patient_responsibles
    ADD CONSTRAINT patient_responsibles_relationship_check
    CHECK (relationship IS NULL OR relationship IN (
      'CHILD','PARENT','SIBLING','NEPHEW','GRANDCHILD','GUARDIAN','FRIEND','PARTNER','OTHER'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
