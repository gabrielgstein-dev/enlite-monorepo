-- Migration 136 — Create patient_responsibles (N responsáveis por paciente, 1 titular obrigatório).
-- Atende LGPD/HIPAA: PII (phone, email, documento) cifrado via KMS.

CREATE TABLE IF NOT EXISTS patient_responsibles (
  id                         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id                 uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  first_name                 text        NOT NULL,
  last_name                  text        NOT NULL,
  relationship               text        NULL,
  phone_encrypted            text        NULL,  -- Número WhatsApp — KMS encrypted (LGPD)
  email_encrypted            text        NULL,  -- Email — KMS encrypted (LGPD)
  document_number_encrypted  text        NULL,  -- Documento (DNI/CPF) — KMS encrypted (LGPD)
  document_type              text        NULL,  -- DNI, Passaporte, etc (não-PII)
  is_primary                 boolean     NOT NULL DEFAULT false,
  display_order              integer     NOT NULL DEFAULT 1,
  source                     text        NOT NULL DEFAULT 'clickup',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE patient_responsibles IS
  'Responsáveis legais do paciente. 1 paciente → N responsáveis, 1 titular obrigatório (enforce via aplicação).';
COMMENT ON COLUMN patient_responsibles.phone_encrypted IS
  'Número de WhatsApp do responsável — KMS encrypted (LGPD). Canal primário de contato quando paciente não tem contato próprio.';
COMMENT ON COLUMN patient_responsibles.email_encrypted IS
  'Email do responsável — KMS encrypted (LGPD).';
COMMENT ON COLUMN patient_responsibles.document_number_encrypted IS
  'Número de documento do responsável (DNI/CPF) — KMS encrypted (LGPD).';

-- Garante no máximo 1 titular por paciente.
CREATE UNIQUE INDEX idx_patient_responsibles_one_primary
  ON patient_responsibles(patient_id)
  WHERE is_primary = true;

-- Lookup rápido por paciente.
CREATE INDEX idx_patient_responsibles_patient_id
  ON patient_responsibles(patient_id);

-- Trigger updated_at (padrão do monorepo).
CREATE TRIGGER trg_patient_responsibles_updated_at
  BEFORE UPDATE ON patient_responsibles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
