-- 038_normalize_patient_relations.sql
--
-- Normaliza endereços e profissionais tratantes de pacientes em tabelas separadas,
-- eliminando o limite de 3 itens e permitindo controle individual de cada registro.

-- ── patient_addresses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_addresses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  address_type     TEXT        NOT NULL,   -- 'primary' | 'secondary' | 'tertiary' | ...
  address_formatted TEXT,                  -- endereço formatado pelo ClickUp (location field)
  address_raw       TEXT,                  -- texto livre do campo "Domicilio Informado"
  display_order    INTEGER     NOT NULL DEFAULT 0,
  source           TEXT        NOT NULL DEFAULT 'clickup',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_addresses_patient
  ON patient_addresses(patient_id);

-- Migra dados existentes das colunas antigas
INSERT INTO patient_addresses (patient_id, address_type, address_formatted, address_raw, display_order)
  SELECT id, 'primary', address_primary, address_primary_raw, 1
  FROM patients
  WHERE address_primary IS NOT NULL OR address_primary_raw IS NOT NULL;

INSERT INTO patient_addresses (patient_id, address_type, address_formatted, address_raw, display_order)
  SELECT id, 'secondary', address_secondary, address_secondary_raw, 2
  FROM patients
  WHERE address_secondary IS NOT NULL OR address_secondary_raw IS NOT NULL;

INSERT INTO patient_addresses (patient_id, address_type, address_formatted, address_raw, display_order)
  SELECT id, 'tertiary', NULL, address_tertiary_raw, 3
  FROM patients
  WHERE address_tertiary_raw IS NOT NULL;

-- Remove colunas antigas de patients
ALTER TABLE patients
  DROP COLUMN IF EXISTS address_primary,
  DROP COLUMN IF EXISTS address_primary_raw,
  DROP COLUMN IF EXISTS address_secondary,
  DROP COLUMN IF EXISTS address_secondary_raw,
  DROP COLUMN IF EXISTS address_tertiary_raw;

-- ── patient_professionals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_professionals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  phone         TEXT,
  email         TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  source        TEXT        NOT NULL DEFAULT 'clickup',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_professionals_patient
  ON patient_professionals(patient_id);

-- Migra dados existentes
INSERT INTO patient_professionals (patient_id, name, phone, email, display_order)
  SELECT id, treating_professional_1, treating_professional_1_phone, treating_professional_1_email, 1
  FROM patients WHERE treating_professional_1 IS NOT NULL;

INSERT INTO patient_professionals (patient_id, name, phone, email, display_order)
  SELECT id, treating_professional_2, treating_professional_2_phone, treating_professional_2_email, 2
  FROM patients WHERE treating_professional_2 IS NOT NULL;

INSERT INTO patient_professionals (patient_id, name, phone, email, display_order)
  SELECT id, treating_professional_3, treating_professional_3_phone, treating_professional_3_email, 3
  FROM patients WHERE treating_professional_3 IS NOT NULL;

-- Remove colunas antigas de patients
ALTER TABLE patients
  DROP COLUMN IF EXISTS treating_professional_1,
  DROP COLUMN IF EXISTS treating_professional_1_phone,
  DROP COLUMN IF EXISTS treating_professional_1_email,
  DROP COLUMN IF EXISTS treating_professional_2,
  DROP COLUMN IF EXISTS treating_professional_2_phone,
  DROP COLUMN IF EXISTS treating_professional_2_email,
  DROP COLUMN IF EXISTS treating_professional_3,
  DROP COLUMN IF EXISTS treating_professional_3_phone,
  DROP COLUMN IF EXISTS treating_professional_3_email,
  DROP COLUMN IF EXISTS multidisciplinary_team;

-- multidisciplinary_team vai para patient_professionals como entrada especial
ALTER TABLE patient_professionals
  ADD COLUMN IF NOT EXISTS is_team BOOLEAN NOT NULL DEFAULT FALSE;
-- is_team = TRUE indica que o registro representa o equipo tratante multidisciplinario,
-- nesse caso o campo name contém o nome do equipe (não um profissional individual)
