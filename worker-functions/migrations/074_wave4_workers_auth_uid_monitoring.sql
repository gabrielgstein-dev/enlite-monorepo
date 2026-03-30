-- ============================================================
-- Migration 074: Wave 4 — D5 — workers.auth_uid monitoring
--
-- Problema: workers.auth_uid deveria corresponder a users.firebase_uid
-- mas sem FK declarada. Workers importados de Excel podem existir sem
-- usuário correspondente.
--
-- Decisão (Opção B): Workers podem existir sem user (import Excel).
-- Não adicionar FK hard — criar view de monitoramento.
-- O fluxo de importação será atualizado para criar user antes do worker
-- quando aplicável.
-- ============================================================

-- View de monitoramento: workers sem user correspondente
CREATE OR REPLACE VIEW workers_without_users AS
SELECT w.id, w.auth_uid, w.email, w.phone, w.created_at, w.overall_status
FROM workers w
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.firebase_uid = w.auth_uid
);

COMMENT ON VIEW workers_without_users IS
  'Monitoramento: workers cujo auth_uid não existe em users. '
  'Útil para detectar workers importados de Excel sem user correspondente. '
  'Alertar se COUNT > 0 em checks periódicos.';

-- Adicionar comentário documentando a relação
COMMENT ON COLUMN workers.auth_uid IS
  'Firebase UID do worker. Corresponde a users.firebase_uid mas sem FK hard — '
  'workers importados de Excel podem não ter user. Ver view workers_without_users.';

DO $$ BEGIN
  RAISE NOTICE 'Migration 074 concluída: view workers_without_users criada';
END $$;
