-- Migration 145 — Rename encuadres.llm_* columns to _deprecated_20260424 (Fase 3.5).
--
-- Rationale: output LLM em sink de texto livre é anti-pattern (value drift
-- quando prompt muda). Nenhuma das 7 colunas tem dado real (0/1720 encuadres
-- populados). rejection_reason_category enum já cobre categorização de rejeição.
-- Fluxos futuros de enrichment de encuadres (se vierem) devem usar colunas
-- tipadas específicas com CHECK constraints, não texto LLM genérico.
--
-- Código de aplicação atualizado em Fase 3.5 — nenhuma coluna llm_* é lida/escrita.
-- Seguinte: migration 146 dropa as colunas _deprecated_.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_processed_at') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_processed_at TO llm_processed_at_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_interest_level') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_interest_level TO llm_interest_level_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_extracted_experience') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_extracted_experience TO llm_extracted_experience_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_availability_notes') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_availability_notes TO llm_availability_notes_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_real_rejection_reason') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_real_rejection_reason TO llm_real_rejection_reason_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_follow_up_potential') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_follow_up_potential TO llm_follow_up_potential_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encuadres' AND column_name='llm_raw_response') THEN
    ALTER TABLE encuadres RENAME COLUMN llm_raw_response TO llm_raw_response_deprecated_20260424;
  END IF;
END;
$$;

-- Rename índices existentes para _deprecated_ (se existirem)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_encuadres_llm_processed_at') THEN
    ALTER INDEX idx_encuadres_llm_processed_at RENAME TO idx_encuadres_llm_processed_at_deprecated_20260424;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_encuadres_llm_pending') THEN
    ALTER INDEX idx_encuadres_llm_pending RENAME TO idx_encuadres_llm_pending_deprecated_20260424;
  END IF;
END;
$$;
