-- ============================================================
-- Migration 023: Consolidate PII/PHI encryption
--
-- Objetivo: eliminar duplicidade de colunas plaintext + encrypted.
-- Todas as informações sensíveis devem existir APENAS nas colunas
-- *_encrypted (KMS / Google Cloud KMS).
--
-- Decisões de design:
--   MANTIDOS em plaintext:
--     • email, phone       — necessários para lookup e deduplicação por SQL
--     • document_type      — indicador de tipo (CPF/CUIT), não o dado em si
--     • cuit               — identificador fiscal público, necessário para dedup SQL
--
--   REMOVIDOS (plaintext):
--     • first_name, last_name, birth_date, sex, gender
--     • document_number, profile_photo_url, languages
--     • sexual_orientation, race, religion, weight_kg, height_cm
--       (adicionados pela migration 008 sem criptografia — regressão corrigida aqui)
--
--   ADICIONADOS (encrypted):
--     • sexual_orientation_encrypted, race_encrypted, religion_encrypted
--     • weight_kg_encrypted, height_cm_encrypted
-- ============================================================

-- ── STEP 1: Adicionar colunas encrypted para os campos da migration 008 ─────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS sexual_orientation_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS race_encrypted                TEXT,
  ADD COLUMN IF NOT EXISTS religion_encrypted            TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg_encrypted           TEXT,
  ADD COLUMN IF NOT EXISTS height_cm_encrypted           TEXT;

-- ── STEP 2: Remover constraints que referenciam colunas plaintext removidas ─
ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS valid_sex;

-- ── STEP 3: Remover colunas plaintext PII/PHI duplicadas ────────────────────
-- NOTA: Os dados nestas colunas podem estar desatualizados ou nulos.
-- A fonte de verdade são as colunas *_encrypted, escritas desde a migration 002.
-- Workers importados via planilha (updateFromImport) tinham dados em plaintext;
-- após esta migration, updateFromImport passará a escrever nas colunas encrypted.
--
-- full_name: criada na migration 001, nunca removida. Desde a migration 002
-- os dados foram migrados para first_name/last_name (e agora para *_encrypted).
-- A coluna full_name é plaintext puro e deve ser removida junto com as demais.
ALTER TABLE workers
  DROP COLUMN IF EXISTS full_name CASCADE,
  DROP COLUMN IF EXISTS first_name CASCADE,
  DROP COLUMN IF EXISTS last_name CASCADE,
  DROP COLUMN IF EXISTS birth_date CASCADE,
  DROP COLUMN IF EXISTS sex CASCADE,
  DROP COLUMN IF EXISTS gender CASCADE,
  DROP COLUMN IF EXISTS document_number CASCADE,
  DROP COLUMN IF EXISTS profile_photo_url CASCADE,
  DROP COLUMN IF EXISTS languages CASCADE;

-- ── STEP 4: Remover colunas plaintext da migration 008 (regressão de segurança) ─
ALTER TABLE workers
  DROP COLUMN IF EXISTS sexual_orientation,
  DROP COLUMN IF EXISTS race,
  DROP COLUMN IF EXISTS religion,
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS height_cm;

-- ── STEP 5: Recriar v_worker_registration_overview sem campos PII ───────────
-- Os campos first_name / last_name foram removidos pois estão agora criptografados.
-- A descriptografia é feita na camada de aplicação (KMSEncryptionService).
CREATE OR REPLACE VIEW v_worker_registration_overview AS
SELECT
  w.id                                                        AS worker_id,
  w.email,
  w.phone,
  w.cuit,
  w.funnel_stage,
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

-- ── STEP 6: Recriar v_potential_duplicate_workers sem matching por nome ──────
-- Os campos first_name / last_name foram removidos da tabela workers.
-- O matching por nome (similarity/trigram) não pode operar sobre ciphertext.
-- A view agora expõe os valores encrypted para que a camada de aplicação
-- possa descriptografar e passar ao LLM de deduplicação.
--
-- Condições mantidas (sem nome):
--   1. CUIT idêntico                         (sinal forte)
--   2. phone levenshtein 1-2                 (typo / truncamento)
--   3. phone levenshtein = 3                 (prefixo "549" faltando no legado)
--   4. Um @enlite.import + phone similar     (mesmo worker, fontes distintas)
--   5. Mesmo domínio de email (não-import)   (sem threshold de nome — LLM decide)
CREATE OR REPLACE VIEW v_potential_duplicate_workers AS
SELECT
  w1.id                                                        AS worker1_id,
  w1.phone                                                     AS worker1_phone,
  w1.email                                                     AS worker1_email,
  w1.first_name_encrypted                                      AS worker1_first_name,
  w1.last_name_encrypted                                       AS worker1_last_name,
  w1.cuit                                                      AS worker1_cuit,
  COALESCE(w1.data_sources, '{}')                             AS worker1_sources,

  w2.id                                                        AS worker2_id,
  w2.phone                                                     AS worker2_phone,
  w2.email                                                     AS worker2_email,
  w2.first_name_encrypted                                      AS worker2_first_name,
  w2.last_name_encrypted                                       AS worker2_last_name,
  w2.cuit                                                      AS worker2_cuit,
  COALESCE(w2.data_sources, '{}')                             AS worker2_sources,

  CASE
    WHEN w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL
         AND replace(w1.cuit,'-','') = replace(w2.cuit,'-','')          THEN 'cuit_match'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2            THEN 'phone_similar'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) = 3                        THEN 'phone_prefix_match'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) <= 3
         AND (
           (w1.email LIKE '%@enlite.import' AND w2.email NOT LIKE '%@enlite.import')
           OR (w2.email LIKE '%@enlite.import' AND w1.email NOT LIKE '%@enlite.import')
         )                                                               THEN 'import_phone_match'
    ELSE 'email_domain_match'
  END                                                          AS match_reason

FROM workers w1
JOIN workers w2 ON w1.id < w2.id
WHERE w1.merged_into_id IS NULL
  AND w2.merged_into_id IS NULL
  AND (

    -- 1. CUIT idêntico (ignora hífens de formatação)
    (
      w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL
      AND replace(w1.cuit, '-', '') = replace(w2.cuit, '-', '')
    )

    -- 2. Telefone com 1-2 dígitos de diferença (typo / truncamento)
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2
    )

    -- 3. Telefone com exatamente 3 dígitos de diferença
    --    Cobre: phone legado 10-digit (ex: 1151265663) vs normalizado 13-digit (5491151265663)
    --    levenshtein('1151265663', '5491151265663') = 3
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) = 3
    )

    -- 4. Um com @enlite.import + telefone similar: mesmo worker, fontes distintas
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND levenshtein(w1.phone, w2.phone) <= 3
      AND (
        (w1.email LIKE '%@enlite.import' AND w2.email NOT LIKE '%@enlite.import')
        OR (w2.email LIKE '%@enlite.import' AND w1.email NOT LIKE '%@enlite.import')
      )
    )

    -- 5. Mesmo domínio de email (não-import) — LLM decide se é a mesma pessoa
    OR (
      w1.email IS NOT NULL AND w2.email IS NOT NULL
      AND w1.email <> w2.email
      AND split_part(w1.email, '@', 2) = split_part(w2.email, '@', 2)
      AND split_part(w1.email, '@', 2) <> 'enlite.import'
    )

  );

-- ── STEP 7: Comentários de documentação ─────────────────────────────────────
COMMENT ON TABLE workers IS 'HIPAA/LGPD Compliant: todos os PHI/PII criptografados com Cloud KMS. Plaintext mantido apenas para: email, phone (lookup/dedup), document_type, cuit (dedup fiscal).';

COMMENT ON COLUMN workers.first_name_encrypted  IS 'Primeiro nome — KMS encrypted (HIPAA #1)';
COMMENT ON COLUMN workers.last_name_encrypted   IS 'Sobrenome — KMS encrypted (HIPAA #1)';
COMMENT ON COLUMN workers.birth_date_encrypted  IS 'Data de nascimento — KMS encrypted (HIPAA #3)';
COMMENT ON COLUMN workers.sex_encrypted         IS 'Sexo biológico — KMS encrypted (HIPAA #10)';
COMMENT ON COLUMN workers.gender_encrypted      IS 'Identidade de gênero — KMS encrypted (HIPAA #10)';
COMMENT ON COLUMN workers.document_number_encrypted IS 'Número de documento — KMS encrypted (HIPAA #11)';
COMMENT ON COLUMN workers.profile_photo_url_encrypted IS 'URL da foto de perfil — KMS encrypted (HIPAA #17)';
COMMENT ON COLUMN workers.languages_encrypted   IS 'Idiomas (JSON array) — KMS encrypted';
COMMENT ON COLUMN workers.phone_encrypted       IS 'Telefone — KMS encrypted (backup; plaintext phone usado para dedup)';
COMMENT ON COLUMN workers.email_encrypted       IS 'Email — KMS encrypted (backup; plaintext email usado para dedup)';
COMMENT ON COLUMN workers.sexual_orientation_encrypted IS 'Orientação sexual — KMS encrypted';
COMMENT ON COLUMN workers.race_encrypted        IS 'Raça/etnia — KMS encrypted';
COMMENT ON COLUMN workers.religion_encrypted    IS 'Religião — KMS encrypted';
COMMENT ON COLUMN workers.weight_kg_encrypted   IS 'Peso em kg — KMS encrypted';
COMMENT ON COLUMN workers.height_cm_encrypted   IS 'Altura em cm — KMS encrypted';

DO $$ BEGIN
  RAISE NOTICE 'Migration 023 concluída: colunas plaintext PII/PHI removidas, colunas encrypted adicionadas para campos da migration 008, views analytics/dedup atualizadas.';
END $$;
