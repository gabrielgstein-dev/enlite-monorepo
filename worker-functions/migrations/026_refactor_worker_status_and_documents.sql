-- ============================================================
-- Migration 026: Refactor Worker Status and Document Fields
--
-- Mudanças:
--   1. Substituir funnel_stage por overall_status (status geral do worker)
--   2. Adicionar application_funnel_stage em worker_job_applications
--   3. Adicionar linkedin_url_encrypted
--   4. Preparar para migração de cuit → document_number_encrypted
--
-- NOTA: A coluna cuit será mantida temporariamente para compatibilidade.
-- Novos imports usarão document_type + document_number_encrypted.
-- Após re-importação completa, cuit será removida em migration futura.
-- ============================================================

-- ── STEP 1: Adicionar overall_status em workers ─────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS overall_status VARCHAR(20) DEFAULT 'ACTIVE'
  CHECK (overall_status IN ('ACTIVE', 'INACTIVE', 'BLACKLISTED', 'HIRED'));

-- Migrar dados existentes de funnel_stage para overall_status
UPDATE workers
SET overall_status = CASE
  WHEN funnel_stage = 'BLACKLIST' THEN 'BLACKLISTED'
  WHEN funnel_stage IN ('QUALIFIED', 'TALENTUM') THEN 'ACTIVE'
  WHEN funnel_stage = 'PRE_TALENTUM' THEN 'ACTIVE'
  ELSE 'ACTIVE'
END
WHERE overall_status = 'ACTIVE'; -- apenas se ainda não foi setado

-- Criar índice para overall_status
CREATE INDEX IF NOT EXISTS idx_workers_overall_status ON workers(overall_status);

-- ── STEP 2: Adicionar application_funnel_stage em worker_job_applications ───
ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS application_funnel_stage VARCHAR(30) DEFAULT 'APPLIED'
  CHECK (application_funnel_stage IN (
    'APPLIED',           -- candidatura enviada
    'PRE_SCREENING',     -- em triagem inicial
    'INTERVIEW_SCHEDULED', -- entrevista agendada
    'INTERVIEWED',       -- entrevistado
    'QUALIFIED',         -- aprovado para a vaga
    'REJECTED',          -- rejeitado
    'HIRED'              -- contratado
  ));

-- Criar índice para application_funnel_stage
CREATE INDEX IF NOT EXISTS idx_worker_job_applications_funnel_stage 
  ON worker_job_applications(application_funnel_stage);

-- ── STEP 3: Adicionar linkedin_url_encrypted ────────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS linkedin_url_encrypted TEXT;

COMMENT ON COLUMN workers.linkedin_url_encrypted IS 'LinkedIn profile URL — KMS encrypted';

-- ── STEP 4: Garantir que document_type existe quando há document_number ─────
-- Esta constraint garante que novos imports sempre especifiquem o tipo
ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS check_document_type_required;

ALTER TABLE workers
  ADD CONSTRAINT check_document_type_required
  CHECK (
    document_number_encrypted IS NULL 
    OR document_type IS NOT NULL
  );

-- ── STEP 5: Atualizar views que usavam funnel_stage ─────────────────────────
-- Recriar v_worker_registration_overview com overall_status
DROP VIEW IF EXISTS v_worker_registration_overview CASCADE;

CREATE OR REPLACE VIEW v_worker_registration_overview AS
SELECT
  w.id                                                        AS worker_id,
  w.email,
  w.phone,
  w.overall_status,
  w.occupation,
  w.registration_completed,
  w.current_step,
  w.status                                                    AS worker_status,
  COALESCE(w.data_sources, '{}')                             AS data_sources,

  COALESCE(wd.documents_status, 'not_started')               AS documents_status,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM worker_job_applications WHERE worker_id = w.id)       AS total_vacancies_applied,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM encuadres WHERE worker_id = w.id)                     AS total_vacancies_interviewed,

  (SELECT COUNT(DISTINCT job_posting_id)
   FROM encuadres WHERE worker_id = w.id
     AND resultado = 'SELECCIONADO')                          AS total_vacancies_approved,

  w.created_at,
  w.updated_at

FROM workers w
LEFT JOIN worker_documents wd ON w.id = wd.worker_id
WHERE w.merged_into_id IS NULL;

-- ── STEP 6: Atualizar workers_docs_expiry_alert view ────────────────────────
DROP VIEW IF EXISTS workers_docs_expiry_alert CASCADE;

CREATE OR REPLACE VIEW workers_docs_expiry_alert AS
SELECT
  w.id                          AS worker_id,
  w.overall_status,
  w.occupation,
  wd.criminal_record_expiry,
  wd.insurance_expiry,
  wd.professional_reg_expiry,
  
  CASE
    WHEN wd.criminal_record_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.criminal_record_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS criminal_record_status,
  
  CASE
    WHEN wd.insurance_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.insurance_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS insurance_status,
  
  CASE
    WHEN wd.professional_reg_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN wd.professional_reg_expiry < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS professional_reg_status

FROM workers w
LEFT JOIN worker_documents wd ON w.id = wd.worker_id
WHERE w.overall_status = 'ACTIVE';

-- ── STEP 7: Comentários de documentação ─────────────────────────────────────
COMMENT ON COLUMN workers.overall_status IS 'Status geral do worker: ACTIVE (ativo no sistema), INACTIVE (inativo), BLACKLISTED (vetado), HIRED (contratado)';
COMMENT ON COLUMN worker_job_applications.application_funnel_stage IS 'Etapa do funil de recrutamento específica para esta candidatura';

-- ── STEP 8: Deprecar funnel_stage (manter por compatibilidade temporária) ───
-- NOTA: funnel_stage será removida em migration futura após re-importação
COMMENT ON COLUMN workers.funnel_stage IS 'DEPRECATED: Use overall_status. Será removida em migration futura.';

DO $$ BEGIN RAISE NOTICE 'Migration 026 concluída: overall_status adicionado, application_funnel_stage criado, linkedin_url_encrypted adicionado'; END $$;
