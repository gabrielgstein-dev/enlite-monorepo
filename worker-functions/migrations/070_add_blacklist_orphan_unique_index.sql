-- Migration 070: Índice parcial para blacklist órfã + limpeza de duplicatas (N7)
--
-- O índice existente idx_blacklist_worker_reason cobre (worker_id, reason)
-- WHERE worker_id IS NOT NULL. Entradas órfãs (worker_id IS NULL) ficam sem
-- constraint de unicidade, permitindo duplicatas por re-import de planilha.
--
-- Estratégia: limpar duplicatas mantendo o mais antigo, depois criar índice.

-- Passo 1: Remover duplicatas órfãs (manter o registro mais antigo por phone+reason)
DELETE FROM blacklist
WHERE worker_id IS NULL
  AND worker_raw_phone IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (worker_raw_phone, reason) id
    FROM blacklist
    WHERE worker_id IS NULL
      AND worker_raw_phone IS NOT NULL
    ORDER BY worker_raw_phone, reason, created_at ASC
  );

-- Passo 2: Criar índice parcial para evitar duplicatas futuras
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_phone_reason_orphan
  ON blacklist(worker_raw_phone, reason)
  WHERE worker_id IS NULL AND worker_raw_phone IS NOT NULL;
