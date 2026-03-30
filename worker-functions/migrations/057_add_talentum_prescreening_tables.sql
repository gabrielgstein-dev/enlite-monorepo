-- 057_add_talentum_prescreening_tables.sql
--
-- Cria as 3 tabelas para persistência de prescreenings recebidos via webhook do Talentum.
--
-- Contexto: O Talentum envia POSTs incrementais — cada POST contém o objeto completo
-- acumulado até aquele momento. Toda persistência é upsert puro.
-- O n8n atua como intermediário e é responsável pelo callback ao Talentum.
-- Nossa Cloud Function apenas responde 200 OK ao n8n.
--
-- Tabelas criadas:
--   talentum_prescreenings           → 1 registro por tentativa (worker × vaga)
--   talentum_questions               → catálogo deduplicado de perguntas (por questionId)
--   talentum_prescreening_responses  → respostas: N por prescreening, uma por (prescreening, question, source)

-- ─────────────────────────────────────────────────────────────────
-- talentum_prescreenings
-- ─────────────────────────────────────────────────────────────────
-- worker_id e job_posting_id são nullable porque o webhook pode chegar
-- antes do worker/vaga existir no sistema (race condition com import de planilha).
-- A cada novo POST incremental, a FK é tentada novamente via COALESCE no ON CONFLICT.

CREATE TABLE IF NOT EXISTS talentum_prescreenings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talentum_prescreening_id VARCHAR(255) UNIQUE NOT NULL,
  talentum_profile_id      VARCHAR(255) NOT NULL,
  worker_id                UUID REFERENCES workers(id) ON DELETE SET NULL,
  job_posting_id           UUID REFERENCES job_postings(id) ON DELETE SET NULL,
  job_case_name            TEXT NOT NULL,
  status                   VARCHAR(50) NOT NULL
                           CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN talentum_prescreenings.talentum_prescreening_id IS
  'ID do prescreening no sistema Talentum — chave de deduplicação para upserts.';
COMMENT ON COLUMN talentum_prescreenings.talentum_profile_id IS
  'ID do perfil no sistema Talentum — não é FK em workers (worker_id assume esse papel).';
COMMENT ON COLUMN talentum_prescreenings.worker_id IS
  'Nullable: preenchido por lookup (email → phone → cuil). Pode chegar null e ser preenchido em POST posterior via COALESCE.';
COMMENT ON COLUMN talentum_prescreenings.job_posting_id IS
  'Nullable: resolvido por ILIKE em job_postings.case_name. Pode chegar null e ser preenchido em POST posterior via COALESCE.';
COMMENT ON COLUMN talentum_prescreenings.job_case_name IS
  'Valor bruto de prescreening.name — preservado para auditoria mesmo quando job_posting_id é resolvido.';

CREATE INDEX IF NOT EXISTS idx_talentum_prescreenings_worker
  ON talentum_prescreenings(worker_id);
CREATE INDEX IF NOT EXISTS idx_talentum_prescreenings_posting
  ON talentum_prescreenings(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_talentum_prescreenings_status
  ON talentum_prescreenings(status);
CREATE INDEX IF NOT EXISTS idx_talentum_prescreenings_profile
  ON talentum_prescreenings(talentum_profile_id);

-- ─────────────────────────────────────────────────────────────────
-- talentum_questions
-- ─────────────────────────────────────────────────────────────────
-- Catálogo deduplicado de perguntas do Talentum.
-- A mesma questionId aparece em múltiplos prescreenings e múltiplos POSTs.
-- Texto e responseType podem mudar no Talentum — são sobrescritos no ON CONFLICT.

CREATE TABLE IF NOT EXISTS talentum_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   VARCHAR(255) UNIQUE NOT NULL,
  question      TEXT NOT NULL,
  response_type VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN talentum_questions.question_id IS
  'questionId vindo do Talentum — chave de deduplicação do catálogo de perguntas.';
COMMENT ON COLUMN talentum_questions.question IS
  'Texto da pergunta. Sobrescrito no ON CONFLICT (texto pode mudar no Talentum).';
COMMENT ON COLUMN talentum_questions.response_type IS
  'Tipo de resposta (ex: TEXT, BOOLEAN, MULTIPLE_CHOICE). Sobrescrito no ON CONFLICT.';

-- ─────────────────────────────────────────────────────────────────
-- talentum_prescreening_responses
-- ─────────────────────────────────────────────────────────────────
-- Respostas associadas a um prescreening específico.
-- response_source discrimina perguntas de cadastro (profile.registerQuestions)
-- de perguntas específicas da vaga (response.state).
-- A mesma questionId pode aparecer nas duas fontes com respostas diferentes — ambas preservadas.
-- ON CONFLICT sobrescreve answer: worker pode editar a resposta antes do status COMPLETED.

CREATE TABLE IF NOT EXISTS talentum_prescreening_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescreening_id   UUID NOT NULL REFERENCES talentum_prescreenings(id) ON DELETE CASCADE,
  question_id       UUID NOT NULL REFERENCES talentum_questions(id),
  answer            TEXT,
  response_source   VARCHAR(50) NOT NULL
                    CHECK (response_source IN ('register', 'prescreening')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prescreening_id, question_id, response_source)
);

COMMENT ON COLUMN talentum_prescreening_responses.answer IS
  'Texto da resposta. NULL = pergunta recebida mas ainda sem resposta. Sobrescrito a cada POST (worker pode editar).';
COMMENT ON COLUMN talentum_prescreening_responses.response_source IS
  '"register" = veio de profile.registerQuestions (perguntas de cadastro do worker). '
  '"prescreening" = veio de response.state (perguntas específicas da vaga).';

CREATE INDEX IF NOT EXISTS idx_talentum_responses_prescreening
  ON talentum_prescreening_responses(prescreening_id);
CREATE INDEX IF NOT EXISTS idx_talentum_responses_question
  ON talentum_prescreening_responses(question_id);
