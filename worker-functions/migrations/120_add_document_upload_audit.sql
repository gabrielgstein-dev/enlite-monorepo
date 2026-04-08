-- Migration 120: Add audit trail for admin document uploads
-- Tracks which admin uploaded/modified each document field

ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS last_uploaded_by_admin_id UUID,
  ADD COLUMN IF NOT EXISTS last_uploaded_by_admin_email TEXT,
  ADD COLUMN IF NOT EXISTS last_uploaded_at TIMESTAMPTZ;

COMMENT ON COLUMN worker_documents.last_uploaded_by_admin_id IS 'UUID of admin user who last uploaded a document on behalf of the worker (NULL = worker uploaded)';
COMMENT ON COLUMN worker_documents.last_uploaded_by_admin_email IS 'Email of admin user who last uploaded a document (for log readability)';
COMMENT ON COLUMN worker_documents.last_uploaded_at IS 'Timestamp of last admin-initiated upload';
