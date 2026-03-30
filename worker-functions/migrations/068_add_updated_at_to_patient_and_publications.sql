-- Migration 068: Adiciona coluna updated_at + trigger a patient_addresses,
-- patient_professionals e publications (I2)
--
-- Essas 3 tabelas foram criadas sem updated_at — inconsistente com o restante
-- do schema e impossibilita auditoria de modificação (compliance LGPD).

ALTER TABLE patient_addresses
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE patient_professionals
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE publications
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER patient_addresses_updated_at
  BEFORE UPDATE ON patient_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER patient_professionals_updated_at
  BEFORE UPDATE ON patient_professionals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
