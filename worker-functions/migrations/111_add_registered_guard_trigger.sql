-- Migration 111: Trigger BEFORE UPDATE que impede status = 'REGISTERED'
-- se os campos obrigatórios não estiverem todos preenchidos.
-- Rede de segurança no banco — nenhum code path (presente ou futuro)
-- consegue marcar um worker como REGISTERED sem completar o cadastro.

CREATE OR REPLACE FUNCTION fn_guard_registered_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Só bloqueia transições PARA 'REGISTERED'; DISABLED e INCOMPLETE_REGISTER passam livre
  IF NEW.status <> 'REGISTERED' THEN
    RETURN NEW;
  END IF;

  -- Workers mesclados não devem ser registrados
  IF NEW.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'Worker mesclado (merged_into_id IS NOT NULL) não pode ser REGISTERED';
  END IF;

  -- Verificar campos obrigatórios na tabela workers
  IF NOT (
    NEW.first_name_encrypted  IS NOT NULL AND NEW.first_name_encrypted  <> '' AND
    NEW.last_name_encrypted   IS NOT NULL AND NEW.last_name_encrypted   <> '' AND
    NEW.sex_encrypted         IS NOT NULL AND NEW.sex_encrypted         <> '' AND
    NEW.gender_encrypted      IS NOT NULL AND NEW.gender_encrypted      <> '' AND
    NEW.birth_date_encrypted  IS NOT NULL AND NEW.birth_date_encrypted  <> '' AND
    NEW.document_number_encrypted IS NOT NULL AND NEW.document_number_encrypted <> '' AND
    NEW.languages_encrypted   IS NOT NULL AND NEW.languages_encrypted   <> '' AND
    NEW.phone                 IS NOT NULL AND NEW.phone                 <> '' AND
    NEW.profession            IS NOT NULL AND NEW.profession            <> '' AND
    NEW.knowledge_level       IS NOT NULL AND NEW.knowledge_level       <> '' AND
    NEW.title_certificate     IS NOT NULL AND NEW.title_certificate     <> '' AND
    NEW.years_experience      IS NOT NULL AND NEW.years_experience      <> '' AND
    NEW.experience_types      IS NOT NULL AND array_length(NEW.experience_types, 1)    > 0 AND
    NEW.preferred_types       IS NOT NULL AND array_length(NEW.preferred_types, 1)      > 0 AND
    NEW.preferred_age_range   IS NOT NULL AND array_length(NEW.preferred_age_range, 1)  > 0
  ) THEN
    RAISE EXCEPTION 'Campos obrigatórios incompletos — não é possível marcar como REGISTERED';
  END IF;

  -- Verificar tabelas satélite: service_area, availability, documentos
  IF NOT EXISTS (
    SELECT 1 FROM worker_service_areas sa
    WHERE sa.worker_id = NEW.id AND sa.address_line IS NOT NULL AND sa.radius_km IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Endereço de atendimento não cadastrado — não é possível marcar como REGISTERED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM worker_availability av
    WHERE av.worker_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Disponibilidade não cadastrada — não é possível marcar como REGISTERED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM worker_documents wd
    WHERE wd.worker_id = NEW.id
      AND wd.resume_cv_url                IS NOT NULL
      AND wd.identity_document_url        IS NOT NULL
      AND wd.criminal_record_url          IS NOT NULL
      AND wd.professional_registration_url IS NOT NULL
      AND wd.liability_insurance_url      IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Documentos obrigatórios incompletos — não é possível marcar como REGISTERED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger BEFORE UPDATE: roda antes de qualquer UPDATE que toque a coluna status
CREATE TRIGGER trg_guard_registered_status
  BEFORE UPDATE OF status ON workers
  FOR EACH ROW
  WHEN (NEW.status = 'REGISTERED' AND (OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION fn_guard_registered_status();
