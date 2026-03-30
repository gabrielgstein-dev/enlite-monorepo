-- ============================================================
-- Migration 073: Wave 4 — D3 + D3-B — assignee_uid e recruiter_uid
--
-- D3:   job_postings.assignee é text → adicionar assignee_uid FK users
-- D3-B: publications.recruiter_name é text → adicionar recruiter_uid FK users
--       encuadres.recruiter_name é text → adicionar recruiter_uid FK users
--
-- Decisão: recrutadores são usuários do sistema (tabela users).
-- Coordenadores já têm tabela própria (migration 072).
-- ============================================================

-- D3 — job_postings.assignee_uid
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS assignee_uid VARCHAR(128)
  REFERENCES users(firebase_uid) ON DELETE SET NULL;

COMMENT ON COLUMN job_postings.assignee_uid IS
  'Firebase UID do admin responsável pela vaga. Substitui o campo assignee (text).';

CREATE INDEX IF NOT EXISTS idx_job_postings_assignee_uid
  ON job_postings(assignee_uid) WHERE assignee_uid IS NOT NULL;

-- Tentar popular a partir de assignee fazendo lookup em users.display_name
UPDATE job_postings jp
SET assignee_uid = u.firebase_uid
FROM users u
WHERE jp.assignee IS NOT NULL
  AND jp.assignee_uid IS NULL
  AND (
    LOWER(TRIM(u.display_name)) = LOWER(TRIM(jp.assignee))
    OR LOWER(TRIM(u.email)) = LOWER(TRIM(jp.assignee))
  );

-- Marcar campo antigo como DEPRECATED
COMMENT ON COLUMN job_postings.assignee IS
  'DEPRECATED: usar assignee_uid com FK para users(firebase_uid). Mantido para referência histórica.';

-- D3-B — publications.recruiter_uid
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS recruiter_uid VARCHAR(128)
  REFERENCES users(firebase_uid) ON DELETE SET NULL;

COMMENT ON COLUMN publications.recruiter_uid IS
  'Firebase UID do recrutador. Substitui recruiter_name (text).';

CREATE INDEX IF NOT EXISTS idx_publications_recruiter_uid
  ON publications(recruiter_uid) WHERE recruiter_uid IS NOT NULL;

-- Tentar popular a partir de recruiter_name
UPDATE publications p
SET recruiter_uid = u.firebase_uid
FROM users u
WHERE p.recruiter_name IS NOT NULL
  AND p.recruiter_uid IS NULL
  AND (
    LOWER(TRIM(u.display_name)) = LOWER(TRIM(p.recruiter_name))
    OR LOWER(TRIM(u.email)) = LOWER(TRIM(p.recruiter_name))
  );

COMMENT ON COLUMN publications.recruiter_name IS
  'DEPRECATED: usar recruiter_uid com FK para users(firebase_uid). Mantido para referência histórica.';

-- D3-B — encuadres.recruiter_uid
ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS recruiter_uid VARCHAR(128)
  REFERENCES users(firebase_uid) ON DELETE SET NULL;

COMMENT ON COLUMN encuadres.recruiter_uid IS
  'Firebase UID do recrutador. Substitui recruiter_name (text).';

CREATE INDEX IF NOT EXISTS idx_encuadres_recruiter_uid
  ON encuadres(recruiter_uid) WHERE recruiter_uid IS NOT NULL;

-- Tentar popular a partir de recruiter_name
UPDATE encuadres e
SET recruiter_uid = u.firebase_uid
FROM users u
WHERE e.recruiter_name IS NOT NULL
  AND e.recruiter_uid IS NULL
  AND (
    LOWER(TRIM(u.display_name)) = LOWER(TRIM(e.recruiter_name))
    OR LOWER(TRIM(u.email)) = LOWER(TRIM(e.recruiter_name))
  );

COMMENT ON COLUMN encuadres.recruiter_name IS
  'DEPRECATED: usar recruiter_uid com FK para users(firebase_uid). Mantido para referência histórica.';

-- Validação
DO $$
DECLARE
  jp_migrated INTEGER;
  jp_total INTEGER;
  pub_migrated INTEGER;
  pub_total INTEGER;
  enc_migrated INTEGER;
  enc_total INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE assignee_uid IS NOT NULL),
         COUNT(*) FILTER (WHERE assignee IS NOT NULL)
  INTO jp_migrated, jp_total
  FROM job_postings;
  RAISE NOTICE 'job_postings: %/% assignees migrados', jp_migrated, jp_total;

  SELECT COUNT(*) FILTER (WHERE recruiter_uid IS NOT NULL),
         COUNT(*) FILTER (WHERE recruiter_name IS NOT NULL)
  INTO pub_migrated, pub_total
  FROM publications;
  RAISE NOTICE 'publications: %/% recruiters migrados', pub_migrated, pub_total;

  SELECT COUNT(*) FILTER (WHERE recruiter_uid IS NOT NULL),
         COUNT(*) FILTER (WHERE recruiter_name IS NOT NULL)
  INTO enc_migrated, enc_total
  FROM encuadres;
  RAISE NOTICE 'encuadres: %/% recruiters migrados', enc_migrated, enc_total;

  RAISE NOTICE 'Migration 073 concluída: assignee_uid e recruiter_uid adicionados';
END $$;
