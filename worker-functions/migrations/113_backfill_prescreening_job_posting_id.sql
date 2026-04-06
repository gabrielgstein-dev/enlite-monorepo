-- 113_backfill_prescreening_job_posting_id.sql
--
-- Corrige talentum_prescreenings com job_posting_id NULL.
-- O Talentum passou a enviar nomes expandidos (ex: "CASO 182, AT, para pacientes con Depresión (F32) - Avellaneda")
-- e o lookup ILIKE não encontrava a vaga "CASO 182" no banco.
-- O fix no código (commit 83cb73e) resolve novos webhooks; esta migration corrige os 3 registros existentes.

UPDATE talentum_prescreenings tp
SET    job_posting_id = jp.id,
       updated_at     = NOW()
FROM   job_postings jp
WHERE  tp.job_posting_id IS NULL
  AND  jp.title = SUBSTRING(tp.job_case_name FROM 'CASO \d+')
  AND  jp.deleted_at IS NULL;
