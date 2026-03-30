-- ============================================================
-- Migration 071: Wave 3 — PII Encryption (LGPD)
--
-- C2:   encuadres.worker_email → worker_email_encrypted
-- C2-B: patient_professionals.phone/email → _encrypted
-- C2-D: workers.whatsapp_phone → whatsapp_phone_encrypted
-- N2:   workers.linkedin_url plaintext → DROP (encrypted já existe)
-- ============================================================

-- ── C2: encuadres.worker_email ──────────────────────────────────────────
-- Email do worker em plaintext na tabela de entrevistas — viola LGPD/HIPAA.
ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS worker_email_encrypted TEXT NULL;

COMMENT ON COLUMN encuadres.worker_email_encrypted
  IS 'Email do worker — KMS encrypted (HIPAA #1). Migrado da coluna plaintext worker_email na Wave 3.';

ALTER TABLE encuadres DROP COLUMN IF EXISTS worker_email;

-- ── C2-B: patient_professionals.phone/email ─────────────────────────────
-- Dados de contato de profissionais tratantes em plaintext — viola LGPD.
ALTER TABLE patient_professionals
  ADD COLUMN IF NOT EXISTS phone_encrypted TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT NULL;

COMMENT ON COLUMN patient_professionals.phone_encrypted
  IS 'Telefone do profissional tratante — KMS encrypted (LGPD)';
COMMENT ON COLUMN patient_professionals.email_encrypted
  IS 'Email do profissional tratante — KMS encrypted (LGPD)';

ALTER TABLE patient_professionals
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email;

-- ── C2-D: workers.whatsapp_phone ────────────────────────────────────────
-- Campo escapou da migration 023. Número pessoal é PII clássica sob LGPD.
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS whatsapp_phone_encrypted TEXT NULL;

COMMENT ON COLUMN workers.whatsapp_phone_encrypted
  IS 'Número de WhatsApp do worker — KMS encrypted (LGPD). Coluna plaintext removida na Wave 3 (C2-D).';

ALTER TABLE workers DROP COLUMN IF EXISTS whatsapp_phone;

-- ── N2: workers.linkedin_url (plaintext duplicado) ──────────────────────
-- linkedin_url_encrypted já existe (migration 026). Plaintext é vetor de vazamento.
DROP INDEX IF EXISTS idx_workers_linkedin;
ALTER TABLE workers DROP COLUMN IF EXISTS linkedin_url;

DO $$ BEGIN RAISE NOTICE 'Migration 071 concluída: Wave 3 PII encryption — 4 colunas plaintext removidas, 4 colunas encrypted adicionadas'; END $$;
