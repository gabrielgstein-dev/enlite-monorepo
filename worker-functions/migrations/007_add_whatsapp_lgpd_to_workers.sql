-- Migration 007: Add WhatsApp phone and LGPD consent fields to workers
-- Opção A: phone tornou-se opcional no init, whatsapp é um campo separado

ALTER TABLE workers
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS lgpd_consent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN workers.whatsapp_phone IS 'WhatsApp phone number provided during registration (optional)';
COMMENT ON COLUMN workers.lgpd_consent_at IS 'Timestamp when the user accepted LGPD/privacy consent during registration';
COMMENT ON COLUMN workers.phone IS 'Primary contact phone (may be filled in Step 1 of wizard if not provided at registration)';
