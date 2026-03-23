-- Migration 042: Campos da Planilla Operativa em job_postings e publications
--
-- job_postings.daily_obs     → coluna OBSERVACIONES do _Índice (atualizada diariamente pela coord)
-- job_postings.inferred_zone → zona inferida dos grupos de publicação (_Publicaciones)
-- publications.group_geographic_zone → zona extraída do nome do grupo

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS daily_obs     TEXT,
  ADD COLUMN IF NOT EXISTS inferred_zone TEXT;

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS group_geographic_zone TEXT;

CREATE INDEX IF NOT EXISTS idx_job_postings_inferred_zone
  ON job_postings(inferred_zone)
  WHERE inferred_zone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_publications_geo_zone
  ON publications(group_geographic_zone)
  WHERE group_geographic_zone IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE 'Migration 042 concluída: daily_obs + inferred_zone em job_postings, group_geographic_zone em publications';
END $$;
