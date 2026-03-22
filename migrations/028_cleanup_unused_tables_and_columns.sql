-- ============================================================
-- Migration 028: Cleanup Unused Tables and Columns
--
-- Remove tabelas e colunas que não estão sendo utilizadas
-- para simplificar o schema e reduzir complexidade.
-- ============================================================

-- ── STEP 1: Remover tabelas completamente desnecessárias ────────────────────

-- Multi-role tables não utilizadas (mantém users e admins_extension para superadmins)
DROP TABLE IF EXISTS managers_extension CASCADE;
DROP TABLE IF EXISTS clients_extension CASCADE;
DROP TABLE IF EXISTS support_extension CASCADE;

-- Worker features não utilizadas
DROP TABLE IF EXISTS worker_quiz_responses CASCADE;
DROP TABLE IF EXISTS worker_availability CASCADE;
DROP TABLE IF EXISTS worker_index CASCADE;

-- ── STEP 2: Remover colunas deprecated/substituídas de workers ──────────────

ALTER TABLE workers
  -- Substituído por overall_status
  DROP COLUMN IF EXISTS funnel_stage CASCADE,
  
  -- Substituído por document_type + document_number_encrypted
  DROP COLUMN IF EXISTS cuit CASCADE,
  
  -- Substituído por first_name_encrypted + last_name_encrypted
  DROP COLUMN IF EXISTS full_name CASCADE,
  
  -- Features de registro não utilizadas
  DROP COLUMN IF EXISTS registration_completed CASCADE,
  DROP COLUMN IF EXISTS current_step CASCADE,
  
  -- Auth features não utilizadas
  DROP COLUMN IF EXISTS must_change_password CASCADE,
  
  -- Address complement não utilizado
  DROP COLUMN IF EXISTS address_complement CASCADE;

-- ── STEP 3: Remover views que dependiam de colunas removidas ────────────────

-- Estas views serão recriadas sem as colunas removidas
DROP VIEW IF EXISTS v_worker_registration_overview CASCADE;
DROP VIEW IF EXISTS v_potential_duplicate_workers CASCADE;

-- Recriar v_worker_registration_overview sem campos removidos
CREATE OR REPLACE VIEW v_worker_registration_overview AS
SELECT
  w.id                                                        AS worker_id,
  w.email,
  w.phone,
  w.overall_status,
  w.occupation,
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

-- Recriar v_potential_duplicate_workers (apenas por phone e email)
CREATE OR REPLACE VIEW v_potential_duplicate_workers AS
SELECT
  w1.id AS worker_id_1,
  w2.id AS worker_id_2,
  w1.phone,
  w1.email,
  w1.created_at AS created_at_1,
  w2.created_at AS created_at_2,
  'phone_match' AS match_type
FROM workers w1
JOIN workers w2 ON (
  w1.phone = w2.phone
  AND w1.phone IS NOT NULL
  AND w1.phone != ''
  AND w1.id < w2.id
)
WHERE w1.merged_into_id IS NULL
  AND w2.merged_into_id IS NULL

UNION ALL

SELECT
  w1.id AS worker_id_1,
  w2.id AS worker_id_2,
  w1.phone,
  w1.email,
  w1.created_at AS created_at_1,
  w2.created_at AS created_at_2,
  'email_match' AS match_type
FROM workers w1
JOIN workers w2 ON (
  w1.email = w2.email
  AND w1.email IS NOT NULL
  AND w1.email NOT LIKE '%@enlite.import'
  AND w1.id < w2.id
)
WHERE w1.merged_into_id IS NULL
  AND w2.merged_into_id IS NULL;

-- ── STEP 4: Remover índices órfãos ──────────────────────────────────────────

DROP INDEX IF EXISTS idx_workers_funnel_stage;
DROP INDEX IF EXISTS idx_workers_registration_completed;

-- ── STEP 5: Comentários de documentação ─────────────────────────────────────

COMMENT ON TABLE workers IS 'Workers (Acompañantes Terapéuticos e Cuidadores). Schema simplificado: apenas campos ativamente utilizados.';

RAISE NOTICE 'Migration 028 concluída: tabelas e colunas não utilizadas removidas';
