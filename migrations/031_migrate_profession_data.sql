-- ============================================================
-- Migration 031: Migrate existing profession data to standardized values
--
-- Converte valores existentes de profession para os 4 valores padronizados:
-- AT, CARER, STUDENT, BOTH
-- ============================================================

-- Migrar dados existentes para valores padronizados
UPDATE workers
SET profession = 'AT'
WHERE profession IS NOT NULL
  AND (
    LOWER(profession) LIKE '%acompañante%'
    OR LOWER(profession) LIKE '%acompanante%'
    OR LOWER(profession) LIKE '%terapeutic%'
    OR LOWER(profession) LIKE '%at%'
    OR LOWER(profession) LIKE '%certificad%'
  )
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH');

UPDATE workers
SET profession = 'BOTH'
WHERE profession IS NOT NULL
  AND (
    LOWER(profession) LIKE '%ambos%'
    OR LOWER(profession) LIKE '%both%'
    OR LOWER(profession) LIKE '%los dos%'
  )
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH');

UPDATE workers
SET profession = 'CARER'
WHERE profession IS NOT NULL
  AND (
    LOWER(profession) LIKE '%cuidador%'
    OR LOWER(profession) LIKE '%cuidar%'
  )
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH');

UPDATE workers
SET profession = 'STUDENT'
WHERE profession IS NOT NULL
  AND (
    LOWER(profession) LIKE '%estudiant%'
    OR LOWER(profession) LIKE '%student%'
    OR LOWER(profession) LIKE '%psicolog%'
    OR LOWER(profession) LIKE '%avanzad%'
  )
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH');

-- Verificar quantos registros ainda não foram classificados
SELECT 
  'Registros não classificados' as status,
  COUNT(*) as count
FROM workers
WHERE profession IS NOT NULL
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH');

-- Listar valores não classificados para análise
SELECT DISTINCT profession, COUNT(*) as count
FROM workers
WHERE profession IS NOT NULL
  AND profession NOT IN ('AT', 'CARER', 'STUDENT', 'BOTH')
GROUP BY profession
ORDER BY count DESC;
