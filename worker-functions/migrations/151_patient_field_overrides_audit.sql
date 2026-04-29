BEGIN;

CREATE TABLE IF NOT EXISTS patient_field_overrides_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  field_name  TEXT        NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  source      TEXT        NOT NULL DEFAULT 'vacancy_create_pdf',
  actor_id    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_field_overrides_patient
  ON patient_field_overrides_audit(patient_id, occurred_at DESC);

COMMIT;
