-- Migration 141: GIN index on worker_documents.document_validations
-- Speeds up ?& operator queries for docs_validated filter.
CREATE INDEX IF NOT EXISTS idx_worker_documents_document_validations
  ON worker_documents USING GIN (document_validations);
