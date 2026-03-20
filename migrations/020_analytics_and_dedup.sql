-- ============================================================
-- Migration 020: Analytics views + Worker deduplication support
--
-- Adiciona:
--   • Extensões: fuzzystrmatch (levenshtein), pg_trgm (similarity)
--   • workers.merged_into_id  — rastreio de merge de duplicatas
--   • workers.data_sources    — quais imports contribuíram dados
--   • VIEW v_job_posting_stats     — estatísticas por vaga
--   • VIEW v_worker_registration_overview — visão completa do worker
--   • VIEW v_potential_duplicate_workers  — candidatos a deduplicação
-- ============================================================

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Rastreio de duplicatas: merged_into_id aponta para o worker canônico
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES workers(id),
  ADD COLUMN IF NOT EXISTS data_sources   TEXT[] DEFAULT '{}';

-- Índice para busca rápida de workers não-mesclados
CREATE INDEX IF NOT EXISTS idx_workers_merged_into_id ON workers(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_data_sources   ON workers USING GIN(data_sources);

-- ─── VIEW: Estatísticas por vaga ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_job_posting_stats AS
SELECT
  jp.id                                                       AS job_posting_id,
  jp.case_number,
  jp.patient_name,
  jp.status                                                   AS case_status,
  jp.priority,
  jp.dependency,
  jp.coordinator_name,
  jp.is_covered,

  -- Total de workers únicos interessados (pre-screening + encuadres)
  (
    SELECT COUNT(DISTINCT worker_id)
    FROM (
      SELECT worker_id FROM worker_job_applications WHERE job_posting_id = jp.id AND worker_id IS NOT NULL
      UNION
      SELECT worker_id FROM encuadres            WHERE job_posting_id = jp.id AND worker_id IS NOT NULL
    ) _all
  )                                                           AS total_interested,

  -- Via Talent Search (pre-screening)
  (SELECT COUNT(DISTINCT worker_id)
   FROM worker_job_applications WHERE job_posting_id = jp.id) AS total_pre_screened,

  -- Tiveram pelo menos 1 encuadre (entrevista)
  (SELECT COUNT(DISTINCT worker_id)
   FROM encuadres WHERE job_posting_id = jp.id)               AS total_interviewed,

  -- Aprovados (SELECCIONADO)
  (SELECT COUNT(DISTINCT worker_id)
   FROM encuadres WHERE job_posting_id = jp.id
     AND resultado = 'SELECCIONADO')                          AS total_approved,

  -- Rejeitados
  (SELECT COUNT(DISTINCT worker_id)
   FROM encuadres WHERE job_posting_id = jp.id
     AND resultado = 'RECHAZADO')                             AS total_rejected,

  -- AT não aceita
  (SELECT COUNT(DISTINCT worker_id)
   FROM encuadres WHERE job_posting_id = jp.id
     AND resultado = 'AT_NO_ACEPTA')                          AS total_no_acepta,

  -- Pendentes (sem resultado ainda)
  (SELECT COUNT(id)
   FROM encuadres WHERE job_posting_id = jp.id
     AND (resultado IS NULL OR resultado = 'PENDIENTE'))      AS total_pending,

  -- Workers com cadastro incompleto interessados nessa vaga
  (
    SELECT COUNT(DISTINCT w.id)
    FROM workers w
    WHERE w.registration_completed = FALSE
      AND w.merged_into_id IS NULL
      AND w.id IN (
        SELECT worker_id FROM worker_job_applications WHERE job_posting_id = jp.id AND worker_id IS NOT NULL
        UNION
        SELECT worker_id FROM encuadres            WHERE job_posting_id = jp.id AND worker_id IS NOT NULL
      )
  )                                                           AS total_incomplete_registration

FROM job_postings jp
WHERE jp.case_number IS NOT NULL;

-- ─── VIEW: Visão completa do worker ─────────────────────────────────────────
CREATE OR REPLACE VIEW v_worker_registration_overview AS
SELECT
  w.id                                                        AS worker_id,
  w.email,
  w.phone,
  w.first_name,
  w.last_name,
  w.cuit,
  w.funnel_stage,
  w.occupation,
  w.registration_completed,
  w.current_step,
  w.status                                                    AS worker_status,
  COALESCE(w.data_sources, '{}')                             AS data_sources,

  -- Status de documentos
  COALESCE(wd.documents_status, 'not_started')               AS documents_status,

  -- Totais de vagas
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

-- ─── VIEW: Candidatos a deduplicação ────────────────────────────────────────
-- Requer fuzzystrmatch (levenshtein) e pg_trgm (similarity)
CREATE OR REPLACE VIEW v_potential_duplicate_workers AS
SELECT
  w1.id                                                       AS worker1_id,
  w1.phone                                                    AS worker1_phone,
  w1.email                                                    AS worker1_email,
  w1.first_name                                               AS worker1_first_name,
  w1.last_name                                                AS worker1_last_name,
  w1.cuit                                                     AS worker1_cuit,
  COALESCE(w1.data_sources, '{}')                            AS worker1_sources,

  w2.id                                                       AS worker2_id,
  w2.phone                                                    AS worker2_phone,
  w2.email                                                    AS worker2_email,
  w2.first_name                                               AS worker2_first_name,
  w2.last_name                                                AS worker2_last_name,
  w2.cuit                                                     AS worker2_cuit,
  COALESCE(w2.data_sources, '{}')                            AS worker2_sources,

  CASE
    WHEN w1.cuit IS NOT NULL AND w1.cuit = w2.cuit                         THEN 'cuit_match'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2              THEN 'phone_similar'
    ELSE 'name_similar'
  END                                                         AS match_reason

FROM workers w1
JOIN workers w2 ON w1.id < w2.id
WHERE w1.merged_into_id IS NULL
  AND w2.merged_into_id IS NULL
  AND (
    -- CUIT idêntico em workers diferentes = duplicata quase certa
    (w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL AND w1.cuit = w2.cuit)

    -- Telefone com 1-2 dígitos de diferença (truncado, typo ou prefixo errado)
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2
    )

    -- Nome similar (trigram > 0.65) + mesmo domínio de email
    OR (
      w1.email IS NOT NULL AND w2.email IS NOT NULL
      AND w1.email <> w2.email
      AND split_part(w1.email, '@', 2) = split_part(w2.email, '@', 2)
      AND similarity(
        lower(COALESCE(w1.first_name,'') || ' ' || COALESCE(w1.last_name,'')),
        lower(COALESCE(w2.first_name,'') || ' ' || COALESCE(w2.last_name,''))
      ) > 0.65
    )
  );

RAISE NOTICE 'Migration 020 concluída: analytics views + deduplication support';
