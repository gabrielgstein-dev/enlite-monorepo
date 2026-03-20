-- ============================================================
-- Migration 021: Corrige v_potential_duplicate_workers para
--               detectar duplicatas cross-source.
--
-- Problema original:
--   _Base1 / _CaseSheets / _ModSheet não têm coluna de email.
--   O código gera emails fantasmas: base1import_xxx@enlite.import
--   A condição "mesmo domínio de email" falha porque
--   enlite.import ≠ gmail.com → o par nunca aparecia como duplicata.
--
-- Solução: 4ª condição na WHERE — nome muito similar (> 0.75)
--   quando UM dos workers tem email gerado (@enlite.import)
--   e o OUTRO tem email real.
--
-- Também:
--   • CUIT lookup agora usa replace(cuit, '-', '') para lidar
--     com CUIT formatados (20-12345678-9 vs 20123456789)
-- ============================================================

CREATE OR REPLACE VIEW v_potential_duplicate_workers AS
SELECT
  w1.id                                                        AS worker1_id,
  w1.phone                                                     AS worker1_phone,
  w1.email                                                     AS worker1_email,
  w1.first_name                                                AS worker1_first_name,
  w1.last_name                                                 AS worker1_last_name,
  w1.cuit                                                      AS worker1_cuit,
  COALESCE(w1.data_sources, '{}')                             AS worker1_sources,

  w2.id                                                        AS worker2_id,
  w2.phone                                                     AS worker2_phone,
  w2.email                                                     AS worker2_email,
  w2.first_name                                                AS worker2_first_name,
  w2.last_name                                                 AS worker2_last_name,
  w2.cuit                                                      AS worker2_cuit,
  COALESCE(w2.data_sources, '{}')                             AS worker2_sources,

  CASE
    WHEN w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL
         AND replace(w1.cuit, '-', '') = replace(w2.cuit, '-', '')    THEN 'cuit_match'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2         THEN 'phone_similar'
    WHEN (w1.email LIKE '%@enlite.import' AND w2.email NOT LIKE '%@enlite.import')
         OR (w2.email LIKE '%@enlite.import' AND w1.email NOT LIKE '%@enlite.import')
                                                                      THEN 'import_email_name_match'
    ELSE 'name_similar'
  END                                                          AS match_reason

FROM workers w1
JOIN workers w2 ON w1.id < w2.id
WHERE w1.merged_into_id IS NULL
  AND w2.merged_into_id IS NULL
  AND (
    -- ── 1. CUIT idêntico (ignora formatação com/sem hífens) ───────────────────
    (
      w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL
      AND replace(w1.cuit, '-', '') = replace(w2.cuit, '-', '')
    )

    -- ── 2. Telefone com 1-2 dígitos de diferença (truncado / typo / prefixo) ──
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2
    )

    -- ── 3. Nome similar + mesmo domínio de email ──────────────────────────────
    OR (
      w1.email IS NOT NULL AND w2.email IS NOT NULL
      AND w1.email <> w2.email
      AND split_part(w1.email, '@', 2) = split_part(w2.email, '@', 2)
      AND split_part(w1.email, '@', 2) <> 'enlite.import'
      AND similarity(
        lower(COALESCE(w1.first_name,'') || ' ' || COALESCE(w1.last_name,'')),
        lower(COALESCE(w2.first_name,'') || ' ' || COALESCE(w2.last_name,''))
      ) > 0.65
    )

    -- ── 4. Email gerado vs email real + nome muito similar ────────────────────
    -- Detecta: worker criado por _Base1/_CaseSheets (sem email real)
    --          vs mesmo worker no Talent Search / Candidatos (com email real).
    -- Threshold mais alto (0.75) para compensar a ausência da confirmação por domínio.
    OR (
      w1.first_name IS NOT NULL AND w1.last_name IS NOT NULL
      AND w2.first_name IS NOT NULL AND w2.last_name IS NOT NULL
      AND (
        (w1.email LIKE '%@enlite.import' AND w2.email NOT LIKE '%@enlite.import')
        OR (w2.email LIKE '%@enlite.import' AND w1.email NOT LIKE '%@enlite.import')
      )
      AND similarity(
        lower(w1.first_name || ' ' || w1.last_name),
        lower(w2.first_name || ' ' || w2.last_name)
      ) > 0.75
    )
  );

RAISE NOTICE 'Migration 021 concluída: dedup view atualizada com detecção cross-source (import_email_name_match)';
