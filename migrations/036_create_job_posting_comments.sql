-- 036_create_job_posting_comments.sql
--
-- Histórico de comentários capturados do ClickUp por vacante.
-- A cada import, se o "Last Comment" mudou (ou o comment_count aumentou),
-- inserimos um novo registro — preservando o histórico cronológico mesmo
-- que o ClickUp export só exponha o comentário mais recente.

-- Coluna de contagem no job_postings (para detectar delta entre imports)
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS clickup_comment_count INTEGER;

-- Tabela de histórico
CREATE TABLE IF NOT EXISTS job_posting_comments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id        UUID        NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  source                TEXT        NOT NULL DEFAULT 'clickup',
  comment_text          TEXT        NOT NULL,
  clickup_comment_count INTEGER,        -- snapshot do count total no momento da captura
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_posting_comments_posting
  ON job_posting_comments(job_posting_id, captured_at DESC);
