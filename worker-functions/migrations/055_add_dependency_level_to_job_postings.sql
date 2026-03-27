-- 055_add_dependency_level_to_job_postings.sql
--
-- Adiciona dependency_level em job_postings para armazenar o nível de dependência
-- do caso conforme importado da Planilla Operativa (_Índice sheet).
--
-- Contexto: migration 037 criou patients.dependency_level para dados vindos do ClickUp.
-- O importer (_Índice) sempre gravou no job_postings, mas a coluna nunca foi criada.
-- Este campo e patients.dependency_level coexistem: origens diferentes, mesma semântica.

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS dependency_level TEXT DEFAULT NULL;
