-- ============================================================
-- Migration 079: D7 — Worker status history table + trigger
--
-- Problem: When a worker's status changes (AVAILABLE → ACTIVE → INACTIVE),
-- the old value is overwritten without trace. No audit trail for
-- analytics, compliance, or debugging.
--
-- Creates:
--   1. worker_status_history table
--   2. Trigger fn_log_worker_status_change() on workers UPDATE
-- ============================================================

-- 1. Create history table
CREATE TABLE worker_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  field_name    VARCHAR(50) NOT NULL,  -- 'status' | 'overall_status' | 'availability_status'
  old_value     VARCHAR(50),
  new_value     VARCHAR(50) NOT NULL,
  changed_by    VARCHAR(128),          -- Firebase UID of admin or 'system'
  change_source VARCHAR(100),          -- 'admin_panel' | 'ana_care_sync' | 'import' | 'app'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for common queries
CREATE INDEX idx_worker_status_history_worker
  ON worker_status_history(worker_id, created_at DESC);

CREATE INDEX idx_worker_status_history_field
  ON worker_status_history(field_name, new_value);

-- 3. Trigger function that logs status changes
CREATE OR REPLACE FUNCTION fn_log_worker_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status,
            current_setting('app.current_uid', true));
  END IF;

  IF OLD.overall_status IS DISTINCT FROM NEW.overall_status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'overall_status', OLD.overall_status, NEW.overall_status,
            current_setting('app.current_uid', true));
  END IF;

  IF OLD.availability_status IS DISTINCT FROM NEW.availability_status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'availability_status', OLD.availability_status, NEW.availability_status,
            current_setting('app.current_uid', true));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger to workers table
CREATE TRIGGER trg_worker_status_history
  AFTER UPDATE OF status, overall_status, availability_status ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_log_worker_status_change();
