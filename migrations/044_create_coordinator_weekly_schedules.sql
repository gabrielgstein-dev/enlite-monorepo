-- Migration 044: Tabela de horas semanais por coordenadora
--
-- Popula a partir da aba _HorasSemanales da Planilla Operativa.
-- Registra quantas horas cada coordenadora tem disponível por período.
-- Insumo para o matching: se uma coordenadora tem 3h/semana, não pode
-- gerenciar muitos casos ativos simultaneamente.
--
-- Chave de deduplicação: (coordinator_name, from_date, to_date)
-- Permite re-importar sem duplicar registros.

CREATE TABLE IF NOT EXISTS coordinator_weekly_schedules (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  coordinator_name VARCHAR(100) NOT NULL,
  coordinator_dni  VARCHAR(20),
  from_date        DATE         NOT NULL,
  to_date          DATE         NOT NULL,
  weekly_hours     DECIMAL(5,2),

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (coordinator_name, from_date, to_date)
);

CREATE INDEX IF NOT EXISTS idx_coord_schedules_name
  ON coordinator_weekly_schedules(coordinator_name);

CREATE INDEX IF NOT EXISTS idx_coord_schedules_period
  ON coordinator_weekly_schedules(from_date, to_date);

CREATE TRIGGER coordinator_weekly_schedules_updated_at
  BEFORE UPDATE ON coordinator_weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  RAISE NOTICE 'Migration 044 concluída: tabela coordinator_weekly_schedules criada';
END $$;
