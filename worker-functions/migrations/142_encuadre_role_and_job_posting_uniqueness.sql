-- ============================================================
-- Migration 142: encuadre role + encuadre_ambiguity_queue + job_posting uniqueness guard-rail
-- ============================================================

-- A) encuadre role column
ALTER TABLE encuadres
  ADD COLUMN IF NOT EXISTS role VARCHAR(20)
  CHECK (role IS NULL OR role IN ('TITULAR', 'RAPID_RESPONSE'));

COMMENT ON COLUMN encuadres.role IS
  'Papel do worker na vaga: TITULAR (presta serviço na rotina) ou RAPID_RESPONSE (backup/equipe de resposta rápida). NULL enquanto não classificado.';

-- B) encuadre_ambiguity_queue — fila de encuadres com case_number que resolve para 2+ vagas
CREATE TABLE IF NOT EXISTS encuadre_ambiguity_queue (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encuadre_id             UUID NOT NULL REFERENCES encuadres(id) ON DELETE CASCADE,
  case_number             INTEGER NOT NULL,
  candidate_job_posting_ids UUID[] NOT NULL,
  resolved_at             TIMESTAMPTZ,
  resolved_job_posting_id UUID REFERENCES job_postings(id),
  resolved_by             VARCHAR(128) REFERENCES users(firebase_uid),
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ambiguity_unresolved
  ON encuadre_ambiguity_queue(resolved_at)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE encuadre_ambiguity_queue IS
  'Fila de encuadres que não puderam ser vinculados automaticamente a uma única vaga porque case_number resolveu para 2+ job_postings. Requer resolução manual.';

-- C) Guard-rail: uniqueness (patient_id, address, schedule) — previne vaga duplicada
-- Aplica-se APENAS quando todos os 3 campos estiverem preenchidos (senão drafts em criação quebram).
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_unique_slot
  ON job_postings (
    patient_id,
    service_address_formatted,
    (schedule::text)
  )
  WHERE patient_id IS NOT NULL
    AND service_address_formatted IS NOT NULL
    AND schedule IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX idx_job_postings_unique_slot IS
  'Guard-rail: impede criar vaga duplicada (mesmo paciente + mesmo endereço + mesmo horário). Aplica-se apenas quando todos 3 campos preenchidos. Permite drafts (schedule/address em branco).';
