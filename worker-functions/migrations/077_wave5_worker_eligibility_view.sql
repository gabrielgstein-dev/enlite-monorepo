-- ============================================================
-- Migration 077: N5 — Materialized view worker_eligibility
--
-- Centralizes the definition of when a worker is matchable
-- or active, based on the 4 status fields:
--   status, overall_status, availability_status, ana_care_status
--
-- Eliminates scattered ad-hoc checks across codebase.
-- ============================================================

-- 1. Document ana_care_status as raw/non-canonical
COMMENT ON COLUMN workers.ana_care_status IS
  'Valor bruto do campo status no Ana Care. Fonte: sync Ana Care. '
  'NUNCA usar diretamente em lógica de matching — usar availability_status (campo canônico derivado).';

COMMENT ON COLUMN workers.status IS
  'Funil de registro no app: pending → in_progress → review → approved → rejected';

COMMENT ON COLUMN workers.overall_status IS
  'Status geral de qualificação: PRE_TALENTUM → QUALIFIED → ACTIVE → BLACKLISTED → HIRED';

COMMENT ON COLUMN workers.availability_status IS
  'Disponibilidade operacional canônica: AVAILABLE | ACTIVE | ONBOARDING | INACTIVE';

-- 2. Create materialized view
CREATE MATERIALIZED VIEW worker_eligibility AS
SELECT
  id,
  status,
  overall_status,
  availability_status,
  (
    status = 'approved'
    AND overall_status IN ('QUALIFIED', 'ACTIVE', 'HIRED', 'MESSAGE_SENT')
    AND (availability_status IS NULL OR availability_status IN ('AVAILABLE', 'ACTIVE'))
    AND deleted_at IS NULL
  ) AS is_matchable,
  (
    status = 'approved'
    AND overall_status NOT IN ('BLACKLISTED', 'INACTIVE')
    AND deleted_at IS NULL
  ) AS is_active
FROM workers;

-- 3. Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_worker_eligibility_id ON worker_eligibility (id);
