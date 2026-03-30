-- ============================================================
-- Migration 078: N6 — Document application_funnel_stage vs application_status
--
-- Problem: Both fields track application progress with overlapping
-- values. No documentation defines which is canonical for what.
--
-- Decision (documented in DECISIONS.md):
--   application_funnel_stage = UI/business field, driven by recruiter
--   application_status       = systemic/technical field for integrations
--
-- The TypeScript mapping FUNNEL_TO_STATUS lives in the domain layer.
-- ============================================================

-- 1. Add column comments defining semantics
COMMENT ON COLUMN worker_job_applications.application_funnel_stage IS
  'Etapa do funil UI: APPLIED > PRE_SCREENING > INTERVIEW_SCHEDULED > INTERVIEWED > QUALIFIED > REJECTED > HIRED. '
  'Campo de negócio, visível na UI, conduzido pelo recrutador.';

COMMENT ON COLUMN worker_job_applications.application_status IS
  'Status técnico sistêmico para integrações: applied, under_review, shortlisted, interview_scheduled, approved, rejected, withdrawn, hired. '
  'Mapeamento com funnel_stage definido em FUNNEL_TO_STATUS (domain layer).';
