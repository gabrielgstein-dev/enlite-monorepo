-- Migration 115: Add JSONB column for Short.io social media links per vacancy
-- Stores generated short links by channel: { "facebook": "https://...", "instagram": "https://...", ... }

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS social_short_links JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN job_postings.social_short_links IS
  'Short.io links with UTM tracking per social channel. Keys: facebook, instagram, whatsapp, linkedin, site';
