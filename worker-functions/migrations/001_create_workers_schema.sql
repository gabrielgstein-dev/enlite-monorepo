-- Enlite Health Platform - Workers Schema
-- HIPAA Compliant: UUID v4 IDs, Audit timestamps, No PII in logs

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workers table: Core registration data
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authentication
    auth_uid VARCHAR(255) UNIQUE NOT NULL,
    
    -- Personal Information (encrypted at rest)
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    
    -- Registration Flow Control
    current_step INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_step CHECK (current_step >= 1 AND current_step <= 10),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'review', 'approved', 'rejected'))
);

-- Service Areas: Geographic coverage with radius
CREATE TABLE worker_service_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    
    -- Geographic Data
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_km INTEGER NOT NULL,
    
    -- Address Information
    address_line VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'BR',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_radius CHECK (radius_km > 0 AND radius_km <= 100),
    CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180)
);

-- Worker Availability: Time slots per weekday
CREATE TABLE worker_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    
    -- Day of week (0 = Sunday, 6 = Saturday)
    day_of_week INTEGER NOT NULL,
    
    -- Time slots
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT unique_worker_day_time UNIQUE (worker_id, day_of_week, start_time, end_time)
);

-- Quiz Responses: Video/Quiz answers history
CREATE TABLE worker_quiz_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    
    -- Quiz Data (usando nomes antigos que serão renomeados na migration 002)
    question_text TEXT NOT NULL,
    answer_value TEXT NOT NULL,
    
    -- Scoring (if applicable)
    is_correct BOOLEAN,
    score INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_workers_auth_uid ON workers(auth_uid);
CREATE INDEX idx_workers_email ON workers(email);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_worker_service_areas_worker_id ON worker_service_areas(worker_id);
CREATE INDEX idx_worker_availability_worker_id ON worker_availability(worker_id);
CREATE INDEX idx_worker_availability_day ON worker_availability(day_of_week);
CREATE INDEX idx_worker_quiz_responses_worker_id ON worker_quiz_responses(worker_id);

-- Trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_service_areas_updated_at BEFORE UPDATE ON worker_service_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_availability_updated_at BEFORE UPDATE ON worker_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_quiz_responses_updated_at BEFORE UPDATE ON worker_quiz_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
