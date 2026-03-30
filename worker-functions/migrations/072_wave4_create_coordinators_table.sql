-- ============================================================
-- Migration 072: Wave 4 — C3 — Tabela coordinators + FK em 4 tabelas
--
-- Problema: coordinator_name aparece como texto livre em
-- job_postings, encuadres, coordinator_weekly_schedules e
-- worker_placement_audits. Qualquer typo cria dados
-- inconsistentes. Coordenadores devem ser entidade própria.
--
-- Passos:
--   1. Criar tabela coordinators
--   2. Popular com nomes distintos das 4 tabelas
--   3. Adicionar coordinator_id FK em cada tabela
--   4. Migrar dados (lookup por nome)
--   5. Migrar UNIQUE constraint de coordinator_weekly_schedules
--   6. Marcar coordinator_name como DEPRECATED
-- ============================================================

-- 1. Tabela coordinators
CREATE TABLE IF NOT EXISTS coordinators (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  dni        VARCHAR(20)  NULL,
  email      VARCHAR(255) NULL,
  is_active  BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT coordinators_name_key UNIQUE (name)
);

CREATE TRIGGER coordinators_updated_at
  BEFORE UPDATE ON coordinators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE coordinators IS 'Entidade coordenador — referenciada por FK em job_postings, encuadres, coordinator_weekly_schedules, worker_placement_audits';

-- 2. Popular com nomes distintos de todas as fontes
INSERT INTO coordinators (name)
SELECT DISTINCT coordinator_name FROM job_postings
  WHERE coordinator_name IS NOT NULL
UNION
SELECT DISTINCT coordinator_name FROM encuadres
  WHERE coordinator_name IS NOT NULL
UNION
SELECT DISTINCT coordinator_name FROM coordinator_weekly_schedules
  WHERE coordinator_name IS NOT NULL
UNION
SELECT DISTINCT coordinator_name FROM worker_placement_audits
  WHERE coordinator_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Migrar DNI de coordinator_weekly_schedules (única tabela que tem)
UPDATE coordinators c
SET dni = cws.coordinator_dni
FROM (
  SELECT DISTINCT ON (coordinator_name) coordinator_name, coordinator_dni
  FROM coordinator_weekly_schedules
  WHERE coordinator_dni IS NOT NULL
  ORDER BY coordinator_name, created_at DESC
) cws
WHERE c.name = cws.coordinator_name AND c.dni IS NULL;

-- 3. Adicionar coordinator_id FK em cada tabela
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES coordinators(id);

ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES coordinators(id);

ALTER TABLE coordinator_weekly_schedules
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES coordinators(id);

ALTER TABLE worker_placement_audits
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES coordinators(id);

-- 4. Migrar dados (lookup por nome)
UPDATE job_postings jp
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = jp.coordinator_name)
WHERE jp.coordinator_name IS NOT NULL AND jp.coordinator_id IS NULL;

UPDATE encuadres e
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = e.coordinator_name)
WHERE e.coordinator_name IS NOT NULL AND e.coordinator_id IS NULL;

UPDATE coordinator_weekly_schedules cws
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = cws.coordinator_name)
WHERE cws.coordinator_name IS NOT NULL AND cws.coordinator_id IS NULL;

UPDATE worker_placement_audits wpa
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = wpa.coordinator_name)
WHERE wpa.coordinator_name IS NOT NULL AND wpa.coordinator_id IS NULL;

-- 5. Migrar UNIQUE constraint de coordinator_weekly_schedules para usar coordinator_id
ALTER TABLE coordinator_weekly_schedules
  DROP CONSTRAINT IF EXISTS coordinator_weekly_schedules_coordinator_name_from_date_to_dat_key;

ALTER TABLE coordinator_weekly_schedules
  ADD CONSTRAINT unique_coordinator_schedule
  UNIQUE (coordinator_id, from_date, to_date);

-- 6. Marcar colunas coordinator_name como DEPRECATED
COMMENT ON COLUMN job_postings.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN encuadres.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN coordinator_weekly_schedules.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN worker_placement_audits.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';

-- Índices para as novas FKs
CREATE INDEX IF NOT EXISTS idx_job_postings_coordinator_id
  ON job_postings(coordinator_id) WHERE coordinator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_encuadres_coordinator_id
  ON encuadres(coordinator_id) WHERE coordinator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coord_schedules_coordinator_id
  ON coordinator_weekly_schedules(coordinator_id) WHERE coordinator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placement_audits_coordinator_id
  ON worker_placement_audits(coordinator_id) WHERE coordinator_id IS NOT NULL;

-- Validação
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  -- Verificar que toda row com coordinator_name tem coordinator_id
  SELECT COUNT(*) INTO orphan_count FROM job_postings
    WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'job_postings: % rows com coordinator_name sem coordinator_id', orphan_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count FROM encuadres
    WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'encuadres: % rows com coordinator_name sem coordinator_id', orphan_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count FROM coordinator_weekly_schedules
    WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'coordinator_weekly_schedules: % rows com coordinator_name sem coordinator_id', orphan_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count FROM worker_placement_audits
    WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'worker_placement_audits: % rows com coordinator_name sem coordinator_id', orphan_count;
  END IF;

  RAISE NOTICE 'Migration 072 concluída: tabela coordinators criada, FKs adicionadas em 4 tabelas';
END $$;
