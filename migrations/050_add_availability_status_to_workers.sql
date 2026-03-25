-- Migration 050: Adicionar availability_status à tabela workers
--
-- Status operacional canônico, independente de plataforma externa.
-- Populado pelo sync com Ana Care, pelo site próprio ou por admin.
-- O matchmaking usa este campo — não ana_care_status diretamente.
--
-- Valores:
--   AVAILABLE  → documentação completa, sem caso ativo, pode ser contactado
--   ACTIVE     → atendendo paciente no momento
--   ONBOARDING → em processo de contratação ou documentação pendente
--   INACTIVE   → desligado / baja

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS availability_status VARCHAR(20)
  CHECK (availability_status IN ('AVAILABLE', 'ACTIVE', 'ONBOARDING', 'INACTIVE'));

COMMENT ON COLUMN workers.availability_status IS
  'Status operacional canônico para matchmaking. '
  'Independente de plataforma: populado por sync Ana Care, site próprio ou admin. '
  'NULL = sem dados, worker é incluído no match com ressalva.';

CREATE INDEX IF NOT EXISTS idx_workers_availability_status
  ON workers (availability_status)
  WHERE availability_status IS NOT NULL;

-- Popula a partir do ana_care_status já importado
UPDATE workers SET availability_status = CASE
  WHEN ana_care_status IN ('En espera de servicio', 'Cubriendo guardias') THEN 'AVAILABLE'
  WHEN ana_care_status = 'Activo'                                         THEN 'ACTIVE'
  WHEN ana_care_status IN ('En proceso de contratación', 'Pre-registro')  THEN 'ONBOARDING'
  WHEN ana_care_status = 'Baja'                                           THEN 'INACTIVE'
  ELSE NULL
END
WHERE ana_care_status IS NOT NULL;
