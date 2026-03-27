-- Enlite Health Platform - Users Base Table
-- Multi-role user system with Base + Extensions pattern
-- HIPAA Compliant: UUID v4 IDs, Audit timestamps, No PII in logs

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users base table: Common data for ALL user types
CREATE TABLE users (
    -- Primary Key (Firebase UID)
    firebase_uid VARCHAR(128) PRIMARY KEY,
    
    -- Authentication & Profile
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    photo_url TEXT,
    
    -- Role Management
    role VARCHAR(50) NOT NULL CHECK (role IN ('worker', 'admin', 'manager', 'client', 'support')),
    
    -- Account Status
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'Base table for all user types. Contains common authentication and profile data.';
COMMENT ON COLUMN users.firebase_uid IS 'Firebase Authentication UID (immutable)';
COMMENT ON COLUMN users.email IS 'User email address (unique, from Firebase Auth)';
COMMENT ON COLUMN users.display_name IS 'User display name (can be updated by user)';
COMMENT ON COLUMN users.photo_url IS 'User profile photo URL (can be updated by user)';
COMMENT ON COLUMN users.role IS 'User role type - determines which extension table to use';
COMMENT ON COLUMN users.is_active IS 'Account active status (for soft delete)';
COMMENT ON COLUMN users.email_verified IS 'Email verification status from Firebase Auth';
