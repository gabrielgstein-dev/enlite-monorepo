-- Fase 1: phase tracking para import jobs
-- Permite que o cliente saiba em qual etapa o processamento está
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS current_phase VARCHAR(30) DEFAULT 'upload_received';

-- Fase 2: log lines persistidos
-- Array JSONB de { ts, level, message } — máx 200 entradas (truncado no repositório)
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]'::jsonb;
