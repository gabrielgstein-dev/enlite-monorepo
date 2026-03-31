-- ============================================================
-- Migration 096: Refactor Worker Status Fields
--
-- Problem: workers table has three overlapping status fields:
--   overall_status  → mixed Talentum funnel + general state
--   availability_status → operational/matchmaking state
--   status          → platform registration completeness
--
-- Decision: Keep only workers.status for platform state.
--   worker_job_applications.application_funnel_stage tracks
--   per-vacancy Talentum progress (already exists).
--
-- New workers.status values:
--   REGISTERED          → cadastro completo
--   INCOMPLETE_REGISTER → faltam dados ou documentos
--   DISABLED            → desativado
--
-- New application_funnel_stage values:
--   INITIATED, IN_PROGRESS, COMPLETED, QUALIFIED,
--   IN_DOUBT, NOT_QUALIFIED, PLACED
-- ============================================================

-- ── STEP 1: Drop trigger before removing columns it references ──────────────

DROP TRIGGER IF EXISTS trg_worker_status_history ON workers;

-- ── STEP 2: Remove overall_status and availability_status columns ───────────
-- CASCADE drops dependent indexes and views automatically.

ALTER TABLE workers DROP COLUMN IF EXISTS overall_status CASCADE;
ALTER TABLE workers DROP COLUMN IF EXISTS availability_status CASCADE;

-- ── STEP 3: Drop existing workers.status constraints ────────────────────────
-- Production uses 'valid_status'; migration scripts may have used other names.

ALTER TABLE workers DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_status_check;
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_status_check1;

-- ── STEP 4: Migrate existing workers.status data to new values ──────────────
-- Map old values → new semantic equivalents (must happen BEFORE re-adding constraint)
UPDATE workers SET status = 'REGISTERED'          WHERE status = 'approved';
UPDATE workers SET status = 'INCOMPLETE_REGISTER' WHERE status IN ('pending', 'in_progress', 'review');
UPDATE workers SET status = 'DISABLED'            WHERE status = 'rejected';
-- Any remaining value not covered above (e.g. old Talentum values) → INCOMPLETE_REGISTER
UPDATE workers SET status = 'INCOMPLETE_REGISTER'
  WHERE status NOT IN ('REGISTERED', 'INCOMPLETE_REGISTER', 'DISABLED');

-- Now add the new constraint (all rows already comply after the migration above)
ALTER TABLE workers
  ADD CONSTRAINT workers_status_check
  CHECK (status IN ('REGISTERED', 'INCOMPLETE_REGISTER', 'DISABLED'));

-- ── STEP 5: Drop existing application_funnel_stage constraint ───────────────

ALTER TABLE worker_job_applications
  DROP CONSTRAINT IF EXISTS worker_job_applications_application_funnel_stage_check;

-- ── STEP 6: Migrate existing application_funnel_stage data ──────────────────
-- (must happen BEFORE re-adding the constraint)

UPDATE worker_job_applications
  SET application_funnel_stage = 'INITIATED'
  WHERE application_funnel_stage = 'APPLIED';

UPDATE worker_job_applications
  SET application_funnel_stage = 'IN_PROGRESS'
  WHERE application_funnel_stage IN ('PRE_SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWED');

UPDATE worker_job_applications
  SET application_funnel_stage = 'QUALIFIED'
  WHERE application_funnel_stage = 'HIRED';

UPDATE worker_job_applications
  SET application_funnel_stage = 'NOT_QUALIFIED'
  WHERE application_funnel_stage = 'REJECTED';

-- Any remaining value not covered above → IN_PROGRESS
UPDATE worker_job_applications
  SET application_funnel_stage = 'IN_PROGRESS'
  WHERE application_funnel_stage NOT IN (
    'INITIATED', 'IN_PROGRESS', 'COMPLETED', 'QUALIFIED',
    'IN_DOUBT', 'NOT_QUALIFIED', 'PLACED'
  );

-- Now add the new constraint (all rows already comply after migration above)
ALTER TABLE worker_job_applications
  ADD CONSTRAINT worker_job_applications_application_funnel_stage_check
  CHECK (application_funnel_stage IN (
    'INITIATED',
    'IN_PROGRESS',
    'COMPLETED',
    'QUALIFIED',
    'IN_DOUBT',
    'NOT_QUALIFIED',
    'PLACED'
  ));

-- ── STEP 7: Drop stale function and recreate tracking trigger ───────────────
-- The old trigger referenced overall_status and availability_status;
-- the new one tracks only workers.status.

DROP FUNCTION IF EXISTS fn_log_worker_status_change();

CREATE OR REPLACE FUNCTION fn_log_worker_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status,
            current_setting('app.current_uid', true));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires only when status column is updated (no more overall_status / availability_status)
CREATE TRIGGER trg_worker_status_history
  AFTER UPDATE OF status ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_log_worker_status_change();

-- ── STEP 8: Update views that referenced overall_status ─────────────────────
-- v_worker_registration_overview and workers_docs_expiry_alert were created in
-- migration 026 with overall_status. Recreate them without that column.

DROP VIEW IF EXISTS v_worker_registration_overview CASCADE;

CREATE OR REPLACE VIEW v_worker_registration_overview AS
SELECT
  w.id                                                        AS worker_id,
  w.email,
  w.phone,
  w.status                                                    AS worker_status,
  w.occupation,
  COALESCE(w.data_sources, '{}')                             AS data_sources,

  COALESCE(wd.documents_status, 'not_started')               AS documents_status,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM worker_job_applications WHERE worker_id = w.id)       AS total_vacancies_applied,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM encuadres WHERE worker_id = w.id)                     AS total_vacancies_interviewed,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM encuadres WHERE worker_id = w.id
     AND resultado = 'SELECCIONADO')                          AS total_vacancies_approved,

  w.created_at,
  w.updated_at

FROM workers w
LEFT JOIN worker_documents wd ON w.id = wd.worker_id
WHERE w.merged_into_id IS NULL;

DROP VIEW IF EXISTS workers_docs_expiry_alert CASCADE;

CREATE OR REPLACE VIEW workers_docs_expiry_alert AS
SELECT
  w.id                          AS worker_id,
  w.status                      AS worker_status,
  w.occupation,
  wd.criminal_record_expiry,
  wd.insurance_expiry,
  wd.professional_reg_expiry,

  CASE
    WHEN wd.criminal_record_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.criminal_record_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS criminal_record_status,

  CASE
    WHEN wd.insurance_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.insurance_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS insurance_status,

  CASE
    WHEN wd.professional_reg_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.professional_reg_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS professional_reg_status

FROM workers w
LEFT JOIN worker_documents wd ON w.id = wd.worker_id
WHERE w.status = 'REGISTERED';

-- Recreate v_workers_current_employment without overall_status
-- (was: WHERE overall_status IN ('ACTIVE','HIRED') → now: WHERE status = 'REGISTERED')
CREATE OR REPLACE VIEW v_workers_current_employment AS
SELECT
  w.id AS worker_id,
  w.email,
  w.phone,
  w.status AS worker_status,
  w.occupation,
  w.branch_office,
  weh.id AS current_employment_id,
  weh.hired_at,
  weh.employment_type,
  weh.notes AS employment_notes,
  CASE
    WHEN weh.hired_at IS NOT NULL THEN (CURRENT_DATE - weh.hired_at)
    ELSE NULL::integer
  END AS days_employed
FROM workers w
LEFT JOIN worker_employment_history weh ON (w.id = weh.worker_id AND weh.terminated_at IS NULL)
WHERE w.status = 'REGISTERED';

-- Recreate workers_without_users without overall_status
DROP VIEW IF EXISTS workers_without_users;
CREATE OR REPLACE VIEW workers_without_users AS
SELECT w.id, w.auth_uid, w.email, w.phone, w.created_at, w.status
FROM workers w
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.firebase_uid = w.auth_uid
);

-- ── STEP 9: Column comments ─────────────────────────────────────────────────

COMMENT ON COLUMN workers.status IS
  'Platform registration state: '
  'REGISTERED = cadastro completo; '
  'INCOMPLETE_REGISTER = faltam dados ou documentos; '
  'DISABLED = desativado.';

COMMENT ON COLUMN worker_job_applications.application_funnel_stage IS
  'Talentum funnel stage for this vacancy: '
  'INITIATED > IN_PROGRESS > COMPLETED > QUALIFIED/IN_DOUBT/NOT_QUALIFIED. '
  'PLACED = worker is currently serving this vacancy.';

DO $$ BEGIN
  RAISE NOTICE 'Migration 096 done: overall_status and availability_status removed, '
               'workers.status and application_funnel_stage constraints updated.';
END $$;
