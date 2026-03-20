-- Enlite Health Platform - User Helper Functions
-- Utility functions for working with multi-role user system

-- Function: Get complete user data with role-specific information
CREATE OR REPLACE FUNCTION get_user_complete(p_firebase_uid VARCHAR)
RETURNS JSON AS $$
DECLARE
    v_user_data JSON;
    v_role VARCHAR;
BEGIN
    -- Get base user data
    SELECT row_to_json(u.*), u.role INTO v_user_data, v_role
    FROM users u
    WHERE u.firebase_uid = p_firebase_uid;
    
    IF v_user_data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Append role-specific data based on role
    CASE v_role
        WHEN 'worker' THEN
            SELECT json_build_object(
                'user', v_user_data,
                'worker_data', row_to_json(we.*),
                'service_areas', (
                    SELECT json_agg(row_to_json(wsa.*))
                    FROM worker_service_areas wsa
                    WHERE wsa.user_id = p_firebase_uid
                ),
                'availability', (
                    SELECT json_agg(row_to_json(wa.*))
                    FROM worker_availability wa
                    WHERE wa.user_id = p_firebase_uid
                )
            ) INTO v_user_data
            FROM workers_extension we
            WHERE we.user_id = p_firebase_uid;
            
        WHEN 'admin' THEN
            SELECT json_build_object(
                'user', v_user_data,
                'admin_data', row_to_json(ae.*)
            ) INTO v_user_data
            FROM admins_extension ae
            WHERE ae.user_id = p_firebase_uid;
            
        WHEN 'manager' THEN
            SELECT json_build_object(
                'user', v_user_data,
                'manager_data', row_to_json(me.*)
            ) INTO v_user_data
            FROM managers_extension me
            WHERE me.user_id = p_firebase_uid;
            
        WHEN 'client' THEN
            SELECT json_build_object(
                'user', v_user_data,
                'client_data', row_to_json(ce.*)
            ) INTO v_user_data
            FROM clients_extension ce
            WHERE ce.user_id = p_firebase_uid;
            
        WHEN 'support' THEN
            SELECT json_build_object(
                'user', v_user_data,
                'support_data', row_to_json(se.*)
            ) INTO v_user_data
            FROM support_extension se
            WHERE se.user_id = p_firebase_uid;
            
        ELSE
            -- Role without extension table, return base data only
            v_user_data := json_build_object('user', v_user_data);
    END CASE;
    
    RETURN v_user_data;
END;
$$ LANGUAGE plpgsql;

-- Function: Create user with role
CREATE OR REPLACE FUNCTION create_user_with_role(
    p_firebase_uid VARCHAR,
    p_email VARCHAR,
    p_display_name VARCHAR,
    p_photo_url TEXT,
    p_role VARCHAR,
    p_role_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Insert into users table
    INSERT INTO users (firebase_uid, email, display_name, photo_url, role)
    VALUES (p_firebase_uid, p_email, p_display_name, p_photo_url, p_role)
    ON CONFLICT (firebase_uid) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        photo_url = EXCLUDED.photo_url,
        updated_at = NOW();
    
    -- Insert into role-specific extension table
    CASE p_role
        WHEN 'worker' THEN
            INSERT INTO workers_extension (user_id, phone, fullmap_data)
            VALUES (
                p_firebase_uid,
                p_role_data->>'phone',
                COALESCE(p_role_data->'fullmap_data', '{}'::JSONB)
            )
            ON CONFLICT (user_id) DO NOTHING;
            
        WHEN 'admin' THEN
            INSERT INTO admins_extension (user_id, department, permissions)
            VALUES (
                p_firebase_uid,
                p_role_data->>'department',
                COALESCE(p_role_data->'permissions', '{}'::JSONB)
            )
            ON CONFLICT (user_id) DO NOTHING;
            
        WHEN 'manager' THEN
            INSERT INTO managers_extension (user_id, department, team_name)
            VALUES (
                p_firebase_uid,
                p_role_data->>'department',
                p_role_data->>'team_name'
            )
            ON CONFLICT (user_id) DO NOTHING;
            
        WHEN 'client' THEN
            INSERT INTO clients_extension (user_id, phone, address)
            VALUES (
                p_firebase_uid,
                p_role_data->>'phone',
                COALESCE(p_role_data->'address', '{}'::JSONB)
            )
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
    END CASE;
    
    -- Return complete user data
    SELECT get_user_complete(p_firebase_uid) INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function: Change user role (with data migration)
CREATE OR REPLACE FUNCTION change_user_role(
    p_firebase_uid VARCHAR,
    p_new_role VARCHAR,
    p_new_role_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSON AS $$
DECLARE
    v_old_role VARCHAR;
    v_result JSON;
BEGIN
    -- Get current role
    SELECT role INTO v_old_role FROM users WHERE firebase_uid = p_firebase_uid;
    
    IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'User not found: %', p_firebase_uid;
    END IF;
    
    IF v_old_role = p_new_role THEN
        RAISE EXCEPTION 'User already has role: %', p_new_role;
    END IF;
    
    -- Update role in users table
    UPDATE users SET role = p_new_role, updated_at = NOW()
    WHERE firebase_uid = p_firebase_uid;
    
    -- Note: Old role extension data is preserved (not deleted)
    -- This allows role history and potential role reversal
    
    -- Create new role extension entry
    CASE p_new_role
        WHEN 'worker' THEN
            INSERT INTO workers_extension (user_id)
            VALUES (p_firebase_uid)
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
            INSERT INTO clients_extension (user_id)
            VALUES (p_firebase_uid)
            ON CONFLICT (user_id) DO NOTHING;
            
        WHEN 'support' THEN
            INSERT INTO support_extension (user_id, department)
            VALUES (p_firebase_uid, COALESCE(p_new_role_data->>'department', 'general'))
            ON CONFLICT (user_id) DO NOTHING;
    END CASE;
    
    -- Return updated user data
    SELECT get_user_complete(p_firebase_uid) INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function: List users by role with pagination
CREATE OR REPLACE FUNCTION list_users_by_role(
    p_role VARCHAR,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT json_build_object(
            'total', COUNT(*) OVER(),
            'limit', p_limit,
            'offset', p_offset,
            'users', json_agg(get_user_complete(firebase_uid))
        )
        FROM (
            SELECT firebase_uid
            FROM users
            WHERE role = p_role AND is_active = true
            ORDER BY created_at DESC
            LIMIT p_limit OFFSET p_offset
        ) u
    );
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON FUNCTION get_user_complete IS 'Returns complete user data including role-specific information as JSON';
COMMENT ON FUNCTION create_user_with_role IS 'Creates a new user with base data and role-specific extension data';
COMMENT ON FUNCTION change_user_role IS 'Changes user role and creates new extension entry. Preserves old role data.';
COMMENT ON FUNCTION list_users_by_role IS 'Lists users by role with pagination support';
