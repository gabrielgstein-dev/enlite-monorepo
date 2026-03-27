-- 037_create_patients.sql
--
-- Tabela de pacientes, populada a partir do export do ClickUp.
-- Cada registro representa um paciente no contexto de um caso ClickUp.
-- A chave de upsert é clickup_task_id (1 task ClickUp = 1 caso = 1 paciente-contexto).
-- Caso o mesmo paciente físico tenha múltiplos casos, haverá múltiplas linhas
-- linkadas a diferentes job_postings.

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave de integração com ClickUp
  clickup_task_id   TEXT UNIQUE NOT NULL,

  -- ── Identidade ────────────────────────────────────────────────────────────
  first_name        TEXT,
  last_name         TEXT,
  birth_date        DATE,
  document_type     TEXT,                  -- DNI, Passaporte, etc.
  document_number   TEXT,
  affiliate_id      TEXT,                  -- Número ID Afiliado (obra social)
  sex               TEXT,                  -- Sexo Asignado al Nacer (uso clínico)
  phone_whatsapp    TEXT,                  -- Número de WhatsApp Paciente

  -- ── Clínico (critical para match) ────────────────────────────────────────
  diagnosis         TEXT,                  -- Diagnóstico (si lo conoce)
  dependency_level  TEXT,                  -- GRAVE | MUY GRAVE | MODERADA | LEVE
  clinical_segments TEXT,                  -- Segmentos Clínicos (dropdown)
  service_type      TEXT,                  -- Servicio: AT | Cuidador(a)
  device_type       TEXT,                  -- Institucional | Domiciliario | Escolar
  additional_comments TEXT,               -- Comentarios Adicionales Paciente
  has_judicial_protection BOOLEAN,         -- Amparo Judicial
  has_cud           BOOLEAN,               -- Posee CUD (certificado de discapacidad)
  has_consent       BOOLEAN,               -- Consentimiento

  -- ── Cobertura / Obra social ───────────────────────────────────────────────
  insurance_informed  TEXT,                -- Cobertura Informada
  insurance_verified  TEXT,                -- Cobertura Verificada

  -- ── Endereços ─────────────────────────────────────────────────────────────
  address_primary       TEXT,             -- Domicilio 1 Principal (formatado ClickUp)
  address_primary_raw   TEXT,             -- Domicilio Informado 1 (texto livre)
  address_secondary     TEXT,             -- Domicilio 2 (formatado ClickUp)
  address_secondary_raw TEXT,             -- Domicilio Informado 2
  address_tertiary_raw  TEXT,             -- Domicilio Informado 3
  city_locality         TEXT,             -- Ciudad / Localidad del Paciente
  province              TEXT,             -- Provincia del Paciente
  zone_neighborhood     TEXT,             -- Zona o Barrio Paciente

  -- ── Responsável ───────────────────────────────────────────────────────────
  responsible_first_name      TEXT,       -- Nombre de Responsable
  responsible_last_name       TEXT,       -- Apellido del Responsable
  responsible_relationship    TEXT,       -- Relación con el Paciente
  responsible_phone           TEXT,       -- Número de WhatsApp Responsable
  responsible_document_type   TEXT,
  responsible_document_number TEXT,

  -- ── Profissionais tratantes ───────────────────────────────────────────────
  treating_professional_1       TEXT,     -- Profesional Tratante Principal
  treating_professional_1_phone TEXT,
  treating_professional_1_email TEXT,
  treating_professional_2       TEXT,
  treating_professional_2_phone TEXT,
  treating_professional_2_email TEXT,
  treating_professional_3       TEXT,
  treating_professional_3_phone TEXT,
  treating_professional_3_email TEXT,
  multidisciplinary_team        TEXT,     -- Equipo Tratante Multidisciplinario

  -- ── Metadados ─────────────────────────────────────────────────────────────
  country     TEXT    NOT NULL DEFAULT 'AR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para match e busca
CREATE INDEX IF NOT EXISTS idx_patients_document
  ON patients(document_number) WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinical_segments
  ON patients(clinical_segments) WHERE clinical_segments IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_service_type
  ON patients(service_type) WHERE service_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_dependency
  ON patients(dependency_level) WHERE dependency_level IS NOT NULL;

-- ── Novas colunas em job_postings ─────────────────────────────────────────
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS patient_id          UUID REFERENCES patients(id),
  ADD COLUMN IF NOT EXISTS weekly_hours        NUMERIC,         -- Horas Semanales
  ADD COLUMN IF NOT EXISTS providers_needed    TEXT,            -- Q Prestadores Necesarios
  ADD COLUMN IF NOT EXISTS active_providers    INTEGER,         -- Q Prestadores Activos
  ADD COLUMN IF NOT EXISTS authorized_period   DATE,            -- Período Autorizado
  ADD COLUMN IF NOT EXISTS marketing_channel   TEXT,            -- Canales de Marketing
  ADD COLUMN IF NOT EXISTS clickup_assignee    TEXT,            -- Assignee
  ADD COLUMN IF NOT EXISTS clickup_task_content TEXT;           -- Task Content (rich text)

CREATE INDEX IF NOT EXISTS idx_job_postings_patient_id
  ON job_postings(patient_id) WHERE patient_id IS NOT NULL;
