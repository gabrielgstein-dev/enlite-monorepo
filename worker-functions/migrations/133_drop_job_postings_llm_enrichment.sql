-- Migration 133: Deprecate job_postings_llm_enrichment table
--
-- The LLM enrichment feature for vacancies has been removed. Matchmaking now
-- uses the manually-curated columns on job_postings (required_sex,
-- required_professions, pathology_types) instead of the LLM-derived fields.
--
-- Following the additive-migrations policy, the table is renamed to a
-- _deprecated_YYYYMMDD suffix rather than dropped. A follow-up migration can
-- remove it once we confirm nothing in production still references it.

BEGIN;

ALTER TABLE IF EXISTS job_postings_llm_enrichment
  RENAME TO job_postings_llm_enrichment_deprecated_20260417;

COMMIT;
