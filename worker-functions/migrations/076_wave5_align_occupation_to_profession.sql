-- ============================================================
-- Migration 076: N1 — Align occupation enum to profession enum
--
-- Problem: occupation uses legacy Spanish values (AT, CUIDADOR, AMBOS)
-- while profession was updated in migration 064 to English values
-- (AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST).
-- This divergence causes incorrect matching results.
--
-- Strategy:
--   CUIDADOR → CAREGIVER (direct mapping)
--   AMBOS    → NULL (no equivalent in new enum; documented in DECISIONS.md)
-- ============================================================

-- 1. Migrate legacy occupation values to new enum
UPDATE workers SET occupation = 'CAREGIVER' WHERE occupation = 'CUIDADOR';
UPDATE workers SET occupation = NULL         WHERE occupation = 'AMBOS';

-- 2. Drop old constraint
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_occupation_check;

-- 3. Add new constraint aligned with profession enum
ALTER TABLE workers
  ADD CONSTRAINT workers_occupation_check
  CHECK (occupation IS NULL OR occupation IN (
    'AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'
  ));

-- 4. Add column comments documenting semantics
COMMENT ON COLUMN workers.profession IS
  'Profissão autodeclarada pelo worker no app Enlite. Source of truth para matching. '
  'Valores: AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST';

COMMENT ON COLUMN workers.occupation IS
  'Profissão registrada via sync Ana Care. Pode divergir de profession. '
  'Mesmo enum de profession após migration 076 de alinhamento.';

-- 5. Create view to monitor divergences between profession and occupation
CREATE OR REPLACE VIEW workers_profession_divergence AS
SELECT id, profession, occupation
FROM workers
WHERE profession IS NOT NULL
  AND occupation IS NOT NULL
  AND profession <> occupation;
