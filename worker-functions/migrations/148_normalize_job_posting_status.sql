-- Migration 148 - Normalize job_posting.status to 7 canonical UPPERCASE EN values.
--
-- Canonical values and their semantics:
--   SEARCHING             -> Actively looking for a new AT
--                           (was: BUSQUEDA, busqueda, searching, BUSQUEDA_ACTIVA)
--   SEARCHING_REPLACEMENT -> Looking for a replacement AT
--                           (was: REEMPLAZO, reemplazo, replacement, REEMPLAZOS, BUSQUEDA_REEMPLAZO)
--   RAPID_RESPONSE        -> Emergency fast-response team
--                           (was: rta_rapida, EQUIPO RESPUESTA RAPIDA, EQUIPO DE RESPUESTA RAPIDA,
--                                 equipo_rta_rapida, FULLY_STAFFED)
--   PENDING_ACTIVATION    -> Matched but waiting to start
--                           (was: ACTIVACION PENDIENTE, activacion_pendiente, pending_activation)
--   ACTIVE                -> AT is operating normally
--                           (was: ACTIVO, active, CUBIERTO)
--   SUSPENDED             -> Temporarily paused
--                           (was: SUSPENDIDO TEMPORALMENTE, paused, on_hold, EN ESPERA, suspended)
--   CLOSED                -> Case ended / cancelled / filled
--                           (was: closed, CANCELADO, cancelled, draft, filled, NULL, any unknown)
--
-- Decision: Phase 3 of the vacancies refactor sprint
-- (docs/SPRINT_VACANCIES_REFACTOR.md). Single CHECK constraint enforced at DB
-- level so no raw value can slip in after this migration.

BEGIN;

-- ── 1. Backfill legacy values ────────────────────────────────────────────────

UPDATE job_postings
  SET status = 'SEARCHING'
  WHERE status IN ('BUSQUEDA', 'busqueda', 'searching', 'BUSQUEDA_ACTIVA');

UPDATE job_postings
  SET status = 'SEARCHING_REPLACEMENT'
  WHERE status IN ('REEMPLAZO', 'reemplazo', 'replacement', 'REEMPLAZOS', 'BUSQUEDA_REEMPLAZO');

UPDATE job_postings
  SET status = 'RAPID_RESPONSE'
  WHERE status IN (
    'rta_rapida',
    'EQUIPO RESPUESTA RAPIDA',
    'EQUIPO DE RESPUESTA RAPIDA',
    'equipo_rta_rapida',
    'FULLY_STAFFED'
  );

UPDATE job_postings
  SET status = 'PENDING_ACTIVATION'
  WHERE status IN ('ACTIVACION PENDIENTE', 'activacion_pendiente', 'pending_activation');

UPDATE job_postings
  SET status = 'ACTIVE'
  WHERE status IN ('ACTIVO', 'active', 'CUBIERTO');

UPDATE job_postings
  SET status = 'SUSPENDED'
  WHERE status IN ('SUSPENDIDO TEMPORALMENTE', 'paused', 'on_hold', 'EN ESPERA', 'suspended');

UPDATE job_postings
  SET status = 'CLOSED'
  WHERE status IN ('closed', 'CANCELADO', 'cancelled', 'draft', 'filled');

UPDATE job_postings
  SET status = 'CLOSED'
  WHERE status IS NULL;

-- Catch-all: any remaining non-canonical value becomes CLOSED
UPDATE job_postings
  SET status = 'CLOSED'
  WHERE status NOT IN (
    'SEARCHING', 'SEARCHING_REPLACEMENT', 'RAPID_RESPONSE',
    'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'CLOSED'
  );

-- ── 2. CHECK constraint ──────────────────────────────────────────────────────
-- Remove stale constraint if present (idempotent via exception handler),
-- then add the definitive 7-value canonical constraint.

DO $$
BEGIN
  ALTER TABLE job_postings
    ADD CONSTRAINT job_postings_status_check
    CHECK (status IN (
      'SEARCHING',
      'SEARCHING_REPLACEMENT',
      'RAPID_RESPONSE',
      'PENDING_ACTIVATION',
      'ACTIVE',
      'SUSPENDED',
      'CLOSED'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    -- constraint already exists with this name; nothing to do
    NULL;
END;
$$;

-- ── 3. Update DEFAULT to a canonical value ───────────────────────────────────
-- The old DEFAULT 'draft' is now rejected by the CHECK constraint above.
-- New rows without an explicit status will default to SEARCHING.

ALTER TABLE job_postings ALTER COLUMN status SET DEFAULT 'SEARCHING';

COMMIT;
