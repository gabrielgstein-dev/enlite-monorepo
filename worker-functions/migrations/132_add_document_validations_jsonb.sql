ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS document_validations JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN worker_documents.document_validations IS
  'Per-document validation map. Keys = doc type slugs. Value = { validated_by: email, validated_at: ISO8601 }. Key removed on re-upload or deletion.';
