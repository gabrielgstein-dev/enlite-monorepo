-- ============================================================
-- Migration 022: Reforça dedup com condição telefone + nome combinados
--
-- Problema:
--   levenshtein('1151265663', '5491151265663') = 3
--   A condição 2 aceita apenas BETWEEN 1 AND 2 → não detecta
--   o caso de worker legado (10-digit sem prefixo 549) vs worker
--   novo (13-digit, normalizado por normalizePhoneAR).
--
-- Solução:
--   Condição 5 — phone_name_combined:
--     levenshtein(phone1, phone2) BETWEEN 1 AND 3  (cobre prefixo 549 = 3 chars)
--     AND similarity(nome1, nome2) > 0.60           (nome confirma a identidade)
--
--   Quando os dois sinais apontam para a mesma pessoa, o threshold
--   maior de telefone é seguro porque o nome corrobora.
--
--   Condição 4 melhorada:
--     import_email_name_match agora aceita threshold de nome mais baixo (0.55)
--     quando telefone também é similar (levenshtein ≤ 3).
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
    WHEN replace(w1.cuit,'-','') = replace(w2.cuit,'-','')
         AND w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL                      THEN 'cuit_match'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2                 THEN 'phone_similar'
    WHEN w1.phone IS NOT NULL AND w2.phone IS NOT NULL
         AND levenshtein(w1.phone, w2.phone) = 3
         AND similarity(
               lower(COALESCE(w1.first_name,'') || ' ' || COALESCE(w1.last_name,'')),
               lower(COALESCE(w2.first_name,'') || ' ' || COALESCE(w2.last_name,''))
             ) > 0.60                                                         THEN 'phone_name_combined'
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

    -- ── 1. CUIT idêntico (ignora hífens de formatação) ────────────────────────
    (
      w1.cuit IS NOT NULL AND w2.cuit IS NOT NULL
      AND replace(w1.cuit, '-', '') = replace(w2.cuit, '-', '')
    )

    -- ── 2. Telefone com 1-2 dígitos de diferença (typo, truncamento) ──────────
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) BETWEEN 1 AND 2
    )

    -- ── 3. Nome similar + mesmo domínio de email (não-import) ─────────────────
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

    -- ── 4. Email gerado vs email real + nome similar ───────────────────────────
    -- Detecta worker de _Base1/_CaseSheets (email @enlite.import)
    -- vs mesmo worker no Talent Search / Candidatos (email real).
    -- Se telefone também é similar, aceita threshold de nome mais baixo.
    OR (
      COALESCE(w1.first_name,'') <> '' AND COALESCE(w2.first_name,'') <> ''
      AND (
        (w1.email LIKE '%@enlite.import' AND w2.email NOT LIKE '%@enlite.import')
        OR (w2.email LIKE '%@enlite.import' AND w1.email NOT LIKE '%@enlite.import')
      )
      AND (
        -- 4a. Apenas nome (threshold alto)
        similarity(
          lower(w1.first_name || ' ' || COALESCE(w1.last_name,'')),
          lower(w2.first_name || ' ' || COALESCE(w2.last_name,''))
        ) > 0.75
        OR
        -- 4b. Nome + telefone confirmam juntos (threshold de nome mais baixo)
        (
          w1.phone IS NOT NULL AND w2.phone IS NOT NULL
          AND levenshtein(w1.phone, w2.phone) <= 3
          AND similarity(
                lower(w1.first_name || ' ' || COALESCE(w1.last_name,'')),
                lower(w2.first_name || ' ' || COALESCE(w2.last_name,''))
              ) > 0.55
        )
      )
    )

    -- ── 5. Telefone similar (levenshtein ≤ 3) + nome similar ──────────────────
    -- Cobre o caso crítico: phone 10-digit legado vs phone 13-digit normalizado.
    -- levenshtein('1151265663', '5491151265663') = 3  (prefixo '549' = 3 chars)
    -- levenshtein('541151265663', '5491151265663') = 2  (coberto pela condição 2)
    -- Exige nome para evitar falsos positivos com threshold maior de phone.
    OR (
      w1.phone IS NOT NULL AND w2.phone IS NOT NULL
      AND w1.phone <> w2.phone
      AND levenshtein(w1.phone, w2.phone) = 3
      AND COALESCE(w1.first_name,'') <> ''
      AND COALESCE(w2.first_name,'') <> ''
      AND similarity(
            lower(w1.first_name || ' ' || COALESCE(w1.last_name,'')),
            lower(w2.first_name || ' ' || COALESCE(w2.last_name,''))
          ) > 0.60
    )

  );

DO $$ BEGIN RAISE NOTICE 'Migration 022 concluída: dedup view com phone_name_combined (cobre 10-digit vs 13-digit argentino)'; END $$;
