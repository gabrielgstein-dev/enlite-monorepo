-- Migration 137 — Rename legacy responsible_* columns to _deprecated_20260422.
-- Dados migrados para patient_responsibles em migration 136 + script de backfill.
-- Pré-requisito: código de aplicação atualizado (PatientService usa PatientResponsibleRepository).
-- Seguinte: migration 138 dropa as colunas _deprecated_ após validação em produção.

ALTER TABLE patients
  RENAME COLUMN responsible_first_name     TO responsible_first_name_deprecated_20260422;
ALTER TABLE patients
  RENAME COLUMN responsible_last_name      TO responsible_last_name_deprecated_20260422;
ALTER TABLE patients
  RENAME COLUMN responsible_relationship   TO responsible_relationship_deprecated_20260422;
ALTER TABLE patients
  RENAME COLUMN responsible_phone          TO responsible_phone_deprecated_20260422;
ALTER TABLE patients
  RENAME COLUMN responsible_document_type  TO responsible_document_type_deprecated_20260422;
ALTER TABLE patients
  RENAME COLUMN responsible_document_number TO responsible_document_number_deprecated_20260422;
