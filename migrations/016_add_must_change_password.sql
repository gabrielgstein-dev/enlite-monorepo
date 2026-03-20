-- ============================================================
-- Migration 016: Add must_change_password to admins_extension
--
-- Tracks whether an admin user needs to change their
-- temporary password on next login.
-- ============================================================

ALTER TABLE admins_extension
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;

COMMENT ON COLUMN admins_extension.must_change_password
  IS 'When true, admin must change temp password before accessing the system';

DO $$
BEGIN
  RAISE NOTICE 'Migration 016 concluída. must_change_password adicionado em admins_extension.';
END $$;
