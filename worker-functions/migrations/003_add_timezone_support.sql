-- Migration 003: Add Timezone Support for Global Availability System
-- This migration adds timezone support to handle workers from different timezones globally

-- Add timezone to workers table
ALTER TABLE workers 
ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC' NOT NULL;

COMMENT ON COLUMN workers.timezone IS 'IANA timezone identifier (e.g., America/Sao_Paulo, Europe/London, Asia/Tokyo)';

-- Add timezone to worker_availability table
ALTER TABLE worker_availability 
ADD COLUMN timezone VARCHAR(50);

-- Copy timezone from workers to existing availability records
UPDATE worker_availability wa
SET timezone = w.timezone
FROM workers w
WHERE wa.worker_id = w.id;

-- Make timezone required
ALTER TABLE worker_availability 
ALTER COLUMN timezone SET NOT NULL;

COMMENT ON COLUMN worker_availability.timezone IS 'IANA timezone - availability times are in this local timezone';

-- Add flag for slots that cross midnight (e.g., 23:00 - 02:00)
ALTER TABLE worker_availability 
ADD COLUMN crosses_midnight BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN worker_availability.crosses_midnight IS 'True if the time slot crosses midnight (end_time on next day)';

-- Update constraint to allow midnight-crossing slots
ALTER TABLE worker_availability 
DROP CONSTRAINT IF EXISTS valid_time_range;

ALTER TABLE worker_availability 
ADD CONSTRAINT valid_time_range 
CHECK (crosses_midnight = TRUE OR end_time > start_time);

-- Create index for timezone queries (useful for filtering workers by timezone)
CREATE INDEX idx_workers_timezone ON workers(timezone);
CREATE INDEX idx_worker_availability_timezone ON worker_availability(timezone);

-- Add validation comment
COMMENT ON CONSTRAINT valid_time_range ON worker_availability IS 
'Ensures end_time > start_time unless crosses_midnight is true (for overnight shifts)';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 003: Timezone support added successfully';
  RAISE NOTICE 'Workers and availability now support IANA timezone identifiers';
  RAISE NOTICE 'Availability slots can now cross midnight with crosses_midnight flag';
END $$;
