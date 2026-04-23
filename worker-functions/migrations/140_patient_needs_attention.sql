-- Migration 140 — Add needs_attention flag to patients.
-- Context: bulk import from ClickUp finds legacy records where neither
-- the patient nor any responsible has phone/email. The contact-channel
-- invariant (validateContactChannel) would reject these, but operationally
-- we want to import the record AND flag it for ops review — they decide
-- whether to complete the data or delete the record.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS needs_attention   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reasons TEXT[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN patients.needs_attention IS
  'true when the patient record has data-quality issues that require operational review (e.g., legacy import without contact channel). Ops reviews and either completes the data or deletes the record.';

COMMENT ON COLUMN patients.attention_reasons IS
  'Reason codes for why needs_attention is true. Convention: UPPERCASE_SNAKE_CASE in English (e.g., MISSING_INFO). No CHECK constraint — intentional flexibility for new reasons without migration. App layer owns the vocabulary (@modules/case/domain/enums/AttentionReason.ts).';

-- Index for the operational dashboard query "list all patients needing attention".
CREATE INDEX IF NOT EXISTS idx_patients_needs_attention
  ON patients(needs_attention)
  WHERE needs_attention = true;
