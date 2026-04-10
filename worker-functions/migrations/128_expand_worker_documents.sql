-- Migration 128: Expand worker documents
-- Adds new fixed document columns and creates worker_additional_documents table.
-- Part of Worker Documents V2 (see docs/ROADMAP_WORKER_DOCUMENTS_V2.md).

-- 1. New fixed columns in worker_documents
ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS identity_document_back_url TEXT,
  ADD COLUMN IF NOT EXISTS monotributo_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS at_certificate_url TEXT;

-- 2. New table for dynamic additional documents (replaces additional_certificates_urls TEXT[])
CREATE TABLE IF NOT EXISTS worker_additional_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_additional_documents_worker_id
  ON worker_additional_documents(worker_id);

-- 3. Migrate existing additional_certificates_urls into new table
INSERT INTO worker_additional_documents (worker_id, label, file_path)
SELECT
  wd.worker_id,
  'Certificado adicional',
  unnest(wd.additional_certificates_urls)
FROM worker_documents wd
WHERE wd.additional_certificates_urls IS NOT NULL
  AND array_length(wd.additional_certificates_urls, 1) > 0
ON CONFLICT DO NOTHING;
