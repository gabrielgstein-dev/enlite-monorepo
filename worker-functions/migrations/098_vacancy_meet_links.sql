-- Migration 098: Google Meet links on job_postings
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS meet_link_1     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meet_datetime_1 TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meet_link_2     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meet_datetime_2 TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meet_link_3     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meet_datetime_3 TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN job_postings.meet_link_1 IS 'Google Meet URL for interview slot 1';
COMMENT ON COLUMN job_postings.meet_datetime_1 IS 'Start datetime resolved from Google Calendar for slot 1';
COMMENT ON COLUMN job_postings.meet_link_2 IS 'Google Meet URL for interview slot 2';
COMMENT ON COLUMN job_postings.meet_datetime_2 IS 'Start datetime resolved from Google Calendar for slot 2';
COMMENT ON COLUMN job_postings.meet_link_3 IS 'Google Meet URL for interview slot 3';
COMMENT ON COLUMN job_postings.meet_datetime_3 IS 'Start datetime resolved from Google Calendar for slot 3';
