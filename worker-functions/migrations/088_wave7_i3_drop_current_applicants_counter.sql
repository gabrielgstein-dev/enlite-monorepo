-- Migration 088: I3 — Remover contador desnormalizado current_applicants
-- Descrição: Remove o campo current_applicants e seu trigger, substituindo
--            por função SQL que computa sob demanda via COUNT(*).
-- Motivo: O trigger pode ficar desatualizado se desabilitado em bulk imports
--         ou se uma operação INSERT/DELETE falhar a meio. O valor correto
--         pode sempre ser computado via COUNT(*) em worker_job_applications.
-- Decisão: Opção A (recomendada pelo roadmap) — computar sob demanda.

-- ── Remover trigger e função do contador ────────────────────────────────────────
DROP TRIGGER IF EXISTS job_applicants_counter ON worker_job_applications;
DROP FUNCTION IF EXISTS update_job_applicants_count();

-- ── Remover coluna desnormalizada ───────────────────────────────────────────────
ALTER TABLE job_postings DROP COLUMN IF EXISTS current_applicants;

-- ── Função helper para uso no código e queries ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_applicant_count(p_job_posting_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM worker_job_applications
  WHERE job_posting_id = p_job_posting_id;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_applicant_count IS
  'Retorna count real de candidatos para uma vaga. Substitui coluna desnormalizada current_applicants (migration 011) removida na wave 7.';
