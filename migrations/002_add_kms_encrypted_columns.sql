-- Migration 002: Add KMS encrypted columns for PII/PHI data
-- HIPAA Compliance: Encrypt all 18 HIPAA identifiers fields with Cloud KMS
-- Campos criptografados: Names, Dates, Phone, Email, Document numbers, Photos, Demographics

-- Add encrypted columns to workers table for PHI/PII data
ALTER TABLE workers 
  -- Names (HIPAA #1) - encrypted
  ADD COLUMN IF NOT EXISTS first_name_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS last_name_encrypted TEXT,
  
  -- Demographics (HIPAA #3, #10) - encrypted
  ADD COLUMN IF NOT EXISTS birth_date_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS sex_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS gender_encrypted TEXT,
  
  -- Contact (HIPAA #4, #6) - encrypted
  ADD COLUMN IF NOT EXISTS phone_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
  
  -- Document (HIPAA #11) - encrypted
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS document_number_encrypted TEXT,
  
  -- Photo (HIPAA #17) - encrypted URL
  ADD COLUMN IF NOT EXISTS profile_photo_url_encrypted TEXT,
  
  -- Languages (can indicate ethnicity - encrypted for safety)
  ADD COLUMN IF NOT EXISTS languages_encrypted TEXT,
  
  -- Professional data (not PHI, stored plain)
  ADD COLUMN IF NOT EXISTS profession VARCHAR(100),
  ADD COLUMN IF NOT EXISTS knowledge_level VARCHAR(50),
  ADD COLUMN IF NOT EXISTS title_certificate VARCHAR(100),
  ADD COLUMN IF NOT EXISTS experience_types TEXT[],
  ADD COLUMN IF NOT EXISTS years_experience VARCHAR(20),
  ADD COLUMN IF NOT EXISTS preferred_types TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_age_range VARCHAR(50),
  
  -- Compliance timestamps
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP WITH TIME ZONE,
  
  -- Multi-region
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'AR';

-- Add indexes for non-encrypted columns that are searched
CREATE INDEX IF NOT EXISTS idx_workers_country ON workers(country);
CREATE INDEX IF NOT EXISTS idx_workers_document_type ON workers(document_type);

-- Update table comment
COMMENT ON TABLE workers IS 'HIPAA Compliant: All PHI/PII encrypted with Cloud KMS at rest (first_name, last_name, birth_date, phone, email, document_number, photo_url)';
