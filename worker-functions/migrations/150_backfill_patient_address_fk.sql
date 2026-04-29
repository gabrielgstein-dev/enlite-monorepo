BEGIN;

-- Audit table
CREATE TABLE IF NOT EXISTS _patient_address_match_audit (
  id                 SERIAL PRIMARY KEY,
  job_posting_id     UUID NOT NULL,
  patient_id         UUID,
  attempted_match    TEXT,
  match_type         TEXT NOT NULL CHECK (match_type IN ('EXACT', 'FUZZY', 'NONE')),
  confidence_score   NUMERIC(4,3),
  matched_address_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pass 1: EXACT match (case-insensitive trim on address_formatted)
WITH matches AS (
  SELECT DISTINCT ON (jp.id)
    jp.id         AS job_posting_id,
    jp.patient_id,
    jp.service_address_formatted AS attempted_match,
    pa.id         AS matched_address_id,
    1.000         AS confidence_score
  FROM job_postings jp
  JOIN patient_addresses pa
    ON pa.patient_id = jp.patient_id
   AND TRIM(LOWER(pa.address_formatted)) = TRIM(LOWER(jp.service_address_formatted))
  WHERE jp.patient_address_id IS NULL
    AND jp.deleted_at IS NULL
    AND jp.service_address_formatted IS NOT NULL
    AND jp.patient_id IS NOT NULL
  ORDER BY jp.id, pa.display_order ASC
)
UPDATE job_postings jp
  SET patient_address_id = m.matched_address_id
FROM matches m
WHERE jp.id = m.job_posting_id;

-- Audit: EXACT matches
INSERT INTO _patient_address_match_audit
  (job_posting_id, patient_id, attempted_match, match_type, confidence_score, matched_address_id)
SELECT
  jp.id,
  jp.patient_id,
  jp.service_address_formatted,
  'EXACT',
  1.000,
  jp.patient_address_id
FROM job_postings jp
WHERE jp.patient_address_id IS NOT NULL
  AND jp.deleted_at IS NULL
  AND jp.service_address_formatted IS NOT NULL;

-- Pass 2: FUZZY match — raw address vs address_raw (if still unmatched)
WITH fuzzy AS (
  SELECT DISTINCT ON (jp.id)
    jp.id         AS job_posting_id,
    jp.patient_id,
    COALESCE(jp.service_address_raw, jp.service_address_formatted) AS attempted_match,
    pa.id         AS matched_address_id,
    0.700         AS confidence_score
  FROM job_postings jp
  JOIN patient_addresses pa
    ON pa.patient_id = jp.patient_id
   AND (
     TRIM(LOWER(pa.address_raw)) = TRIM(LOWER(jp.service_address_raw))
     OR TRIM(LOWER(pa.address_formatted)) LIKE '%' || TRIM(LOWER(SPLIT_PART(jp.service_address_formatted, ',', 1))) || '%'
   )
  WHERE jp.patient_address_id IS NULL
    AND jp.deleted_at IS NULL
    AND jp.patient_id IS NOT NULL
    AND COALESCE(jp.service_address_raw, jp.service_address_formatted) IS NOT NULL
  ORDER BY jp.id, pa.display_order ASC
)
UPDATE job_postings jp
  SET patient_address_id = f.matched_address_id
FROM fuzzy f
WHERE jp.id = f.job_posting_id;

-- Audit: FUZZY matches
INSERT INTO _patient_address_match_audit
  (job_posting_id, patient_id, attempted_match, match_type, confidence_score, matched_address_id)
SELECT
  jp.id,
  jp.patient_id,
  COALESCE(jp.service_address_raw, jp.service_address_formatted),
  'FUZZY',
  0.700,
  jp.patient_address_id
FROM job_postings jp
WHERE jp.patient_address_id IS NOT NULL
  AND jp.deleted_at IS NULL
  AND jp.id NOT IN (SELECT job_posting_id FROM _patient_address_match_audit);

-- Audit: NONE (no match found)
INSERT INTO _patient_address_match_audit
  (job_posting_id, patient_id, attempted_match, match_type, confidence_score, matched_address_id)
SELECT
  jp.id,
  jp.patient_id,
  COALESCE(jp.service_address_raw, jp.service_address_formatted),
  'NONE',
  0.000,
  NULL
FROM job_postings jp
WHERE jp.patient_address_id IS NULL
  AND jp.deleted_at IS NULL
  AND jp.patient_id IS NOT NULL
  AND jp.id NOT IN (SELECT job_posting_id FROM _patient_address_match_audit);

COMMIT;
