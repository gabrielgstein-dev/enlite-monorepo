-- Migration 134: Move department, last_login_at, login_count to users table.
-- These fields are now canonical on users for admin/recruiter/community_manager.
-- admins_extension keeps access_level, must_change_password, permissions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count    INTEGER DEFAULT 0;

COMMENT ON COLUMN users.department IS
  'Department for staff roles (admin/recruiter/community_manager). For manager/support, the source of truth remains their extension table.';

-- Backfill from admins_extension for existing admin users
UPDATE users u
SET    department     = ae.department,
       last_login_at  = ae.last_login_at,
       login_count    = ae.login_count
FROM   admins_extension ae
WHERE  ae.user_id = u.firebase_uid;

-- Deprecate must_change_password: invitation link flow replaces temp password;
-- column kept for backward compatibility.
COMMENT ON COLUMN admins_extension.must_change_password IS
  'deprecated since migration 134 — invitation link flow replaces temp password; column kept for backward compatibility';

-- Updated create_user_with_role: department now stored in users for staff roles
CREATE OR REPLACE FUNCTION create_user_with_role(
  p_firebase_uid VARCHAR,
  p_email        VARCHAR,
  p_display_name VARCHAR,
  p_photo_url    TEXT,
  p_role         VARCHAR,
  p_role_data    JSONB DEFAULT '{}'::JSONB
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  INSERT INTO users (firebase_uid, email, display_name, photo_url, role, department)
  VALUES (
    p_firebase_uid,
    p_email,
    p_display_name,
    p_photo_url,
    p_role,
    CASE
      WHEN p_role IN ('admin', 'recruiter', 'community_manager', 'manager', 'support')
      THEN p_role_data->>'department'
      ELSE NULL
    END
  )
  ON CONFLICT (firebase_uid) DO UPDATE
  SET email        = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      photo_url    = EXCLUDED.photo_url,
      department   = COALESCE(EXCLUDED.department, users.department),
      updated_at   = NOW();

  CASE p_role
    WHEN 'worker' THEN
      INSERT INTO workers_extension (user_id, phone, fullmap_data)
      VALUES (p_firebase_uid, p_role_data->>'phone', COALESCE(p_role_data->'fullmap_data', '{}'::JSONB))
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'admin' THEN
      -- department backfilled to users above; keep admins_extension for access_level / permissions
      INSERT INTO admins_extension (user_id, department, permissions)
      VALUES (p_firebase_uid, p_role_data->>'department', COALESCE(p_role_data->'permissions', '{}'::JSONB))
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'manager' THEN
      INSERT INTO managers_extension (user_id, department, team_name)
      VALUES (p_firebase_uid, p_role_data->>'department', p_role_data->>'team_name')
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'client' THEN
      INSERT INTO clients_extension (user_id, phone, address)
      VALUES (p_firebase_uid, p_role_data->>'phone', COALESCE(p_role_data->'address', '{}'::JSONB))
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'support' THEN
      INSERT INTO support_extension (user_id, department, specialization)
      VALUES (
        p_firebase_uid,
        p_role_data->>'department',
        CASE
          WHEN p_role_data->'specialization' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(p_role_data->'specialization'))
          ELSE ARRAY[]::TEXT[]
        END
      )
      ON CONFLICT (user_id) DO NOTHING;

    ELSE
      -- recruiter, community_manager: row in users is sufficient
      NULL;
  END CASE;

  SELECT get_user_complete(p_firebase_uid) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Updated change_user_role: department now stored in users
CREATE OR REPLACE FUNCTION change_user_role(
  p_firebase_uid  VARCHAR,
  p_new_role      VARCHAR,
  p_new_role_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSON AS $$
DECLARE
  v_old_role VARCHAR;
  v_result   JSON;
BEGIN
  SELECT role INTO v_old_role FROM users WHERE firebase_uid = p_firebase_uid;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_firebase_uid;
  END IF;

  IF v_old_role = p_new_role THEN
    RAISE EXCEPTION 'User already has role: %', p_new_role;
  END IF;

  UPDATE users
  SET    role       = p_new_role,
         department = COALESCE(p_new_role_data->>'department', department),
         updated_at = NOW()
  WHERE  firebase_uid = p_firebase_uid;

  CASE p_new_role
    WHEN 'worker' THEN
      INSERT INTO workers_extension (user_id) VALUES (p_firebase_uid)
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'admin' THEN
      INSERT INTO admins_extension (user_id, department, permissions)
      VALUES (p_firebase_uid, p_new_role_data->>'department', COALESCE(p_new_role_data->'permissions', '{}'::JSONB))
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'manager' THEN
      INSERT INTO managers_extension (user_id, department)
      VALUES (p_firebase_uid, p_new_role_data->>'department')
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'client' THEN
      INSERT INTO clients_extension (user_id) VALUES (p_firebase_uid)
      ON CONFLICT (user_id) DO NOTHING;

    WHEN 'support' THEN
      INSERT INTO support_extension (user_id, department)
      VALUES (p_firebase_uid, COALESCE(p_new_role_data->>'department', 'general'))
      ON CONFLICT (user_id) DO NOTHING;

    ELSE
      -- recruiter, community_manager: no extension table needed
      NULL;
  END CASE;

  SELECT get_user_complete(p_firebase_uid) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  RAISE NOTICE 'Migration 134: department, last_login_at, login_count added to users; create_user_with_role and change_user_role updated.';
END $$;
