-- Enlite Health Platform - Future Role Extension Tables
-- Prepared for multi-role expansion: admins, managers, clients, support

-- Admins Extension: Platform administrators
CREATE TABLE admins_extension (
    -- Foreign key to users table
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(firebase_uid) ON DELETE CASCADE,
    
    -- Admin-specific data
    department VARCHAR(100),
    permissions JSONB, -- Granular permissions beyond role
    access_level INTEGER DEFAULT 1 CHECK (access_level >= 1 AND access_level <= 10),
    
    -- Audit & Security
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Managers Extension: Team/department managers
CREATE TABLE managers_extension (
    -- Foreign key to users table
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(firebase_uid) ON DELETE CASCADE,
    
    -- Manager-specific data
    department VARCHAR(100),
    team_name VARCHAR(100),
    team_size INTEGER,
    reports_to VARCHAR(128) REFERENCES users(firebase_uid), -- Manager hierarchy
    
    -- Performance metrics
    managed_workers_count INTEGER DEFAULT 0,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Clients Extension: Service clients/patients
CREATE TABLE clients_extension (
    -- Foreign key to users table
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(firebase_uid) ON DELETE CASCADE,
    
    -- Client-specific data
    phone VARCHAR(20),
    preferred_language VARCHAR(10) DEFAULT 'pt-BR',
    
    -- Address
    address JSONB,
    
    -- Service preferences
    preferred_service_types TEXT[],
    special_requirements TEXT,
    
    -- Billing
    payment_method VARCHAR(50),
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Support Extension: Customer support staff
CREATE TABLE support_extension (
    -- Foreign key to users table
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(firebase_uid) ON DELETE CASCADE,
    
    -- Support-specific data
    department VARCHAR(100) DEFAULT 'general',
    specialization TEXT[], -- e.g., ['billing', 'technical', 'onboarding']
    
    -- Performance metrics
    tickets_resolved INTEGER DEFAULT 0,
    average_response_time_minutes INTEGER,
    
    -- Availability
    is_available BOOLEAN DEFAULT true,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_admins_extension_department ON admins_extension(department);
CREATE INDEX idx_admins_extension_access_level ON admins_extension(access_level);

CREATE INDEX idx_managers_extension_department ON managers_extension(department);
CREATE INDEX idx_managers_extension_reports_to ON managers_extension(reports_to);

CREATE INDEX idx_clients_extension_phone ON clients_extension(phone);
CREATE INDEX idx_clients_extension_preferred_language ON clients_extension(preferred_language);

CREATE INDEX idx_support_extension_department ON support_extension(department);
CREATE INDEX idx_support_extension_is_available ON support_extension(is_available);

-- Triggers to auto-update updated_at
CREATE TRIGGER update_admins_extension_updated_at BEFORE UPDATE ON admins_extension
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_managers_extension_updated_at BEFORE UPDATE ON managers_extension
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_extension_updated_at BEFORE UPDATE ON clients_extension
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_extension_updated_at BEFORE UPDATE ON support_extension
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE admins_extension IS 'Extension table for admin-specific data. References users table.';
COMMENT ON TABLE managers_extension IS 'Extension table for manager-specific data. References users table.';
COMMENT ON TABLE clients_extension IS 'Extension table for client-specific data. References users table.';
COMMENT ON TABLE support_extension IS 'Extension table for support staff-specific data. References users table.';

COMMENT ON COLUMN managers_extension.reports_to IS 'Manager hierarchy - references another user with manager or admin role';
COMMENT ON COLUMN clients_extension.preferred_service_types IS 'Array of preferred service types for matching';
COMMENT ON COLUMN support_extension.specialization IS 'Array of support specializations for ticket routing';
