-- ============================================================
-- Migration 014: Enlite AR Operational Schema
-- Workers × Casos × Encuadres
--
-- DEDUPLICAÇÃO:
--   workers      → UPSERT por phone (chave natural)
--   job_postings → UPSERT por case_number
--   encuadres    → UPSERT por dedup_hash
--   blacklist    → UPSERT por worker_id + reason
--   publications → UPSERT por dedup_hash
-- ============================================================

-- ----------------------------------------
-- 1. Estender job_postings com campos AR
-- ----------------------------------------
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS case_number      INTEGER,
  ADD COLUMN IF NOT EXISTS patient_name     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dependency       VARCHAR(20)  CHECK (dependency IN ('GRAVE','MUY_GRAVE')),
  ADD COLUMN IF NOT EXISTS priority         VARCHAR(20)  CHECK (priority IN ('URGENTE','NORMAL')),
  ADD COLUMN IF NOT EXISTS is_covered       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS coordinator_name VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_case_number
  ON job_postings(case_number)
  WHERE case_number IS NOT NULL;

-- ----------------------------------------
-- 2. Estender workers com campos AR
-- ----------------------------------------
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS ana_care_id   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cuit          VARCHAR(30),

  -- Ocupação: campo fixo do worker, atualizável pelo admin
  ADD COLUMN IF NOT EXISTS occupation    VARCHAR(20)
    CHECK (occupation IN ('AT','CUIDADOR','AMBOS')),

  -- Etapa do funil de recrutamento
  -- PRE_TALENTUM  → lead captado, nunca terminou o funil (aba NoTerminaronTalentum)
  -- TALENTUM      → passou pelo processo Talentum completo
  -- QUALIFIED     → aprovado, pronto para ser alocado em casos
  -- BLACKLIST     → vetado
  ADD COLUMN IF NOT EXISTS funnel_stage  VARCHAR(20) DEFAULT 'PRE_TALENTUM'
    CHECK (funnel_stage IN ('PRE_TALENTUM','TALENTUM','QUALIFIED','BLACKLIST'));

-- Índice único por phone para UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_phone_unique
  ON workers(phone)
  WHERE phone IS NOT NULL AND phone != '';

-- Índice para filtrar por etapa do funil
CREATE INDEX IF NOT EXISTS idx_workers_funnel_stage
  ON workers(funnel_stage);

-- ----------------------------------------
-- 3. Tabela encuadres
--    Uma linha = um evento de entrevista worker × caso
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS encuadres (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  worker_id         UUID REFERENCES workers(id) ON DELETE SET NULL,
  job_posting_id    UUID REFERENCES job_postings(id) ON DELETE CASCADE,

  -- Dados crus da planilha (mantidos para rastreabilidade)
  worker_raw_name   VARCHAR(200),
  worker_raw_phone  VARCHAR(30),
  occupation_raw    VARCHAR(100),

  -- Recrutamento
  recruiter_name    VARCHAR(100),
  coordinator_name  VARCHAR(100),
  recruitment_date  DATE,

  -- Entrevista
  interview_date    DATE,
  interview_time    TIME,
  meet_link         VARCHAR(255),
  attended          BOOLEAN,
  absence_reason    TEXT,

  -- Resultado
  accepts_case      VARCHAR(20) CHECK (accepts_case IN ('Si','No','A confirmar')),
  rejection_reason  TEXT,
  resultado         VARCHAR(30) CHECK (resultado IN (
                      'SELECCIONADO','RECHAZADO','AT_NO_ACEPTA',
                      'REPROGRAMAR','REEMPLAZO','BLACKLIST','PENDIENTE'
                    )),
  redireccionamiento VARCHAR(200),

  -- Documentação verificada na entrevista
  has_cv            BOOLEAN,
  has_dni           BOOLEAN,
  has_cert_at       BOOLEAN,
  has_afip          BOOLEAN,
  has_cbu           BOOLEAN,
  has_ap            BOOLEAN,
  has_seguros       BOOLEAN,
  worker_email      VARCHAR(255),

  -- Observações texto livre (input para LLM)
  obs_reclutamiento TEXT,
  obs_encuadre      TEXT,
  obs_adicionales   TEXT,

  -- Campos enriquecidos por LLM
  llm_processed_at          TIMESTAMPTZ,
  llm_interest_level        VARCHAR(10) CHECK (llm_interest_level IN ('ALTO','MEDIO','BAIXO','NULO')),
  llm_extracted_experience  JSONB,
  llm_availability_notes    TEXT,
  llm_real_rejection_reason TEXT,
  llm_follow_up_potential   BOOLEAN,
  llm_raw_response          JSONB,

  -- Hash para deduplicação
  dedup_hash        VARCHAR(64) UNIQUE,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encuadres_worker       ON encuadres(worker_id);
CREATE INDEX IF NOT EXISTS idx_encuadres_job          ON encuadres(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_encuadres_resultado    ON encuadres(resultado);
CREATE INDEX IF NOT EXISTS idx_encuadres_llm_pending  ON encuadres(llm_processed_at)
  WHERE llm_processed_at IS NULL
    AND (obs_reclutamiento IS NOT NULL OR obs_encuadre IS NOT NULL);

CREATE TRIGGER encuadres_updated_at
  BEFORE UPDATE ON encuadres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------
-- 4. Tabela blacklist
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS blacklist (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id         UUID REFERENCES workers(id) ON DELETE CASCADE,
  worker_raw_name   VARCHAR(200),
  worker_raw_phone  VARCHAR(30),
  reason            TEXT NOT NULL,
  detail            TEXT,
  registered_by     VARCHAR(100),
  can_take_eventual BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_worker_reason
  ON blacklist(worker_id, reason)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blacklist_worker ON blacklist(worker_id);

-- ----------------------------------------
-- 5. Tabela publications
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS publications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_posting_id  UUID REFERENCES job_postings(id) ON DELETE CASCADE,
  channel         VARCHAR(50),
  group_name      VARCHAR(200),
  recruiter_name  VARCHAR(100),
  published_at    TIMESTAMPTZ,
  observations    TEXT,
  dedup_hash      VARCHAR(64) UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publications_job       ON publications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_publications_channel   ON publications(channel);
CREATE INDEX IF NOT EXISTS idx_publications_recruiter ON publications(recruiter_name);

-- ----------------------------------------
-- 6. Tabela import_jobs (rastreamento de uploads)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename        VARCHAR(255) NOT NULL,
  file_hash       VARCHAR(64) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','error')),
  total_rows         INTEGER DEFAULT 0,
  processed_rows     INTEGER DEFAULT 0,
  error_rows         INTEGER DEFAULT 0,
  skipped_rows       INTEGER DEFAULT 0,
  workers_created    INTEGER DEFAULT 0,
  workers_updated    INTEGER DEFAULT 0,
  cases_created      INTEGER DEFAULT 0,
  cases_updated      INTEGER DEFAULT 0,
  encuadres_created  INTEGER DEFAULT 0,
  encuadres_skipped  INTEGER DEFAULT 0,
  error_details   JSONB,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_file_hash
  ON import_jobs(file_hash)
  WHERE status = 'done';

-- ----------------------------------------
-- Verificação final
-- ----------------------------------------
DO $$
DECLARE missing TEXT[];
BEGIN
  SELECT array_agg(t) INTO missing
  FROM unnest(ARRAY['encuadres','blacklist','publications','import_jobs']) t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = t
  );
  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Migration 014 incompleta. Tabelas faltando: %', array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'Migration 014 concluída com sucesso!';
END $$;
