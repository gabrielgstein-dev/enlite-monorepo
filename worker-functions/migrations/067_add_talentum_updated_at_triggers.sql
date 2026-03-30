-- Migration 067: Adiciona triggers updated_at às 3 tabelas Talentum (I1)
--
-- A migration 057 criou talentum_prescreenings, talentum_questions e
-- talentum_prescreening_responses com coluna updated_at mas sem trigger
-- BEFORE UPDATE. Sem o trigger, updated_at nunca é atualizado após INSERT.
--
-- A função update_updated_at_column() já existe (criada em 001).

CREATE TRIGGER talentum_prescreenings_updated_at
  BEFORE UPDATE ON talentum_prescreenings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER talentum_questions_updated_at
  BEFORE UPDATE ON talentum_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER talentum_prescreening_responses_updated_at
  BEFORE UPDATE ON talentum_prescreening_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
