-- Migration 138 — Drop _deprecated_20260422 responsible columns from patients.
-- Preceded by migration 137 (rename) and validated in production.
-- Safe to run after confirming no remaining reads/writes on the deprecated columns.

ALTER TABLE patients
  DROP COLUMN IF EXISTS responsible_first_name_deprecated_20260422,
  DROP COLUMN IF EXISTS responsible_last_name_deprecated_20260422,
  DROP COLUMN IF EXISTS responsible_relationship_deprecated_20260422,
  DROP COLUMN IF EXISTS responsible_phone_deprecated_20260422,
  DROP COLUMN IF EXISTS responsible_document_type_deprecated_20260422,
  DROP COLUMN IF EXISTS responsible_document_number_deprecated_20260422;
