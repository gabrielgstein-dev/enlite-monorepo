-- Migration 104: Recreate worker_availability table
-- Reverts the removal from migration 028, as the availability feature is needed for workers to register their schedules.

CREATE TABLE IF NOT EXISTS worker_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone VARCHAR(50) NOT NULL,
    crosses_midnight BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT valid_time_range CHECK (crosses_midnight = TRUE OR end_time > start_time),
    CONSTRAINT unique_worker_day_time UNIQUE (worker_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_worker_availability_worker_id ON worker_availability(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_availability_timezone ON worker_availability(timezone);
