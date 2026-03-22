-- Migration 034: Create worker_locations table
-- Purpose: Store worker address and location information from Excel imports
-- Columns: Domicilio (address), Zona (work zone), Zona Interes (interest zone)

BEGIN;

-- Create worker_locations table
CREATE TABLE worker_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    
    -- Address information (from Domicilio column)
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'AR',
    postal_code TEXT,
    
    -- Zone information (from ZONA column)
    work_zone TEXT,
    
    -- Interest zone (from ZONA INTERES column)
    interest_zone TEXT,
    
    -- Metadata
    data_source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: one location record per worker
    CONSTRAINT unique_worker_location UNIQUE (worker_id)
);

-- Index for faster lookups
CREATE INDEX idx_worker_locations_worker_id ON worker_locations(worker_id);
CREATE INDEX idx_worker_locations_city ON worker_locations(city);
CREATE INDEX idx_worker_locations_work_zone ON worker_locations(work_zone);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_worker_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_locations_updated_at
    BEFORE UPDATE ON worker_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_locations_updated_at();

-- Add comment for documentation
COMMENT ON TABLE worker_locations IS 'Stores worker address and location information imported from Excel files (Domicilio, ZONA, ZONA INTERES)';
COMMENT ON COLUMN worker_locations.address IS 'Full address from Domicilio column';
COMMENT ON COLUMN worker_locations.work_zone IS 'Work zone from ZONA column';
COMMENT ON COLUMN worker_locations.interest_zone IS 'Interest zone from ZONA INTERES column';

COMMIT;
