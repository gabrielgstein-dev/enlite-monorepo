-- Migration 069: Converte country para bpchar(2) com CHECK em patients e
-- worker_locations (D4 + D4-B)
--
-- Todas as outras tabelas com campo country usam bpchar(2) + CHECK (AR|BR).
-- patients e worker_locations usavam TEXT sem constraint.

-- Normalizar valores inválidos antes da conversão de tipo
UPDATE patients SET country = 'AR'
  WHERE country NOT IN ('AR', 'BR') OR country IS NULL;

UPDATE worker_locations SET country = 'AR'
  WHERE country NOT IN ('AR', 'BR') OR country IS NULL;

-- patients: converter tipo + NOT NULL + CHECK
ALTER TABLE patients
  ALTER COLUMN country TYPE bpchar(2) USING country::bpchar(2);

ALTER TABLE patients
  ALTER COLUMN country SET NOT NULL;

ALTER TABLE patients
  ADD CONSTRAINT valid_patient_country
  CHECK (country = ANY (ARRAY['AR'::bpchar, 'BR'::bpchar]));

-- worker_locations: converter tipo + NOT NULL + CHECK
ALTER TABLE worker_locations
  ALTER COLUMN country TYPE bpchar(2) USING country::bpchar(2);

ALTER TABLE worker_locations
  ALTER COLUMN country SET NOT NULL;

ALTER TABLE worker_locations
  ADD CONSTRAINT valid_worker_locations_country
  CHECK (country = ANY (ARRAY['AR'::bpchar, 'BR'::bpchar]));
