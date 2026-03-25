-- Migration 049: Adicionar ana_care_status à tabela workers
--
-- Armazena o estado operacional do worker na plataforma Ana Care.
-- Usado pelo MatchmakingService como filtro primário de disponibilidade.
--
-- Estados possíveis:
--   En espera de servicio  → disponível, documentação completa, sem paciente
--   Cubriendo guardias     → disponível, cobrindo plantões eventuais
--   Activo                 → ocupado, atendendo paciente ativo
--   En proceso de contratación → em onboarding, não contactar
--   Pre-registro           → cadastro incompleto, documentação pendente
--   Baja                   → desligado

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS ana_care_status VARCHAR(60);

COMMENT ON COLUMN workers.ana_care_status IS
  'Estado operacional na plataforma Ana Care. '
  'Disponíveis: "En espera de servicio", "Cubriendo guardias". '
  'Indisponíveis: "Activo", "En proceso de contratación", "Pre-registro", "Baja".';

CREATE INDEX IF NOT EXISTS idx_workers_ana_care_status
  ON workers (ana_care_status)
  WHERE ana_care_status IS NOT NULL;
