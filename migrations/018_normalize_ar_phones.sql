-- ============================================================
-- Migration 018: Normaliza telefones argentinos para 549XXXXXXXXXX
--
-- O formato canônico AR é 549XXXXXXXXXX (13 dígitos).
-- Dados históricos podem ter:
--   10 dígitos → falta país + móvel  → prepend '549'
--   11 dígitos começando com '54'    → falta o '9'  → '549' + digitos[2:]
--   12 dígitos começando com '54'    → idem acima   → '549' + digitos[2:]
--   13 dígitos começando com '549'   → já correto
-- ============================================================

-- workers.phone
UPDATE workers
SET phone = '549' || phone
WHERE length(phone) = 10
  AND phone ~ '^[0-9]{10}$';

UPDATE workers
SET phone = '549' || substring(phone FROM 3)
WHERE length(phone) = 11
  AND phone ~ '^54[0-9]{9}$'
  AND phone NOT LIKE '549%';

UPDATE workers
SET phone = '549' || substring(phone FROM 3)
WHERE length(phone) = 12
  AND phone ~ '^54[0-9]{10}$'
  AND phone NOT LIKE '549%';

-- encuadres.worker_raw_phone
UPDATE encuadres
SET worker_raw_phone = '549' || worker_raw_phone
WHERE length(worker_raw_phone) = 10
  AND worker_raw_phone ~ '^[0-9]{10}$';

UPDATE encuadres
SET worker_raw_phone = '549' || substring(worker_raw_phone FROM 3)
WHERE length(worker_raw_phone) = 11
  AND worker_raw_phone ~ '^54[0-9]{9}$'
  AND worker_raw_phone NOT LIKE '549%';

UPDATE encuadres
SET worker_raw_phone = '549' || substring(worker_raw_phone FROM 3)
WHERE length(worker_raw_phone) = 12
  AND worker_raw_phone ~ '^54[0-9]{10}$'
  AND worker_raw_phone NOT LIKE '549%';

-- blacklist.worker_raw_phone
UPDATE blacklist
SET worker_raw_phone = '549' || worker_raw_phone
WHERE length(worker_raw_phone) = 10
  AND worker_raw_phone ~ '^[0-9]{10}$';

UPDATE blacklist
SET worker_raw_phone = '549' || substring(worker_raw_phone FROM 3)
WHERE length(worker_raw_phone) = 11
  AND worker_raw_phone ~ '^54[0-9]{9}$'
  AND worker_raw_phone NOT LIKE '549%';

UPDATE blacklist
SET worker_raw_phone = '549' || substring(worker_raw_phone FROM 3)
WHERE length(worker_raw_phone) = 12
  AND worker_raw_phone ~ '^54[0-9]{10}$'
  AND worker_raw_phone NOT LIKE '549%';

-- Re-linka encuadres → workers agora que os phones estão uniformes
UPDATE encuadres e
SET worker_id = w.id
FROM workers w
WHERE e.worker_id IS NULL
  AND e.worker_raw_phone IS NOT NULL
  AND w.phone = e.worker_raw_phone;

-- Re-linka blacklist → workers
UPDATE blacklist b
SET worker_id = w.id
FROM workers w
WHERE b.worker_id IS NULL
  AND b.worker_raw_phone IS NOT NULL
  AND w.phone = b.worker_raw_phone;

RAISE NOTICE 'Migration 018 concluída: telefones AR normalizados para 549XXXXXXXXXX e encuadres/blacklist re-linkados';
