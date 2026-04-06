-- Migration 112: Correção retroativa — rebaixa workers REGISTERED que não têm
-- todos os campos obrigatórios preenchidos.
-- Reutiliza a mesma lógica da migration 109 (direção inversa).
-- Idempotente: pode ser rodada múltiplas vezes sem efeito colateral.

-- Workers REGISTERED que NÃO têm todos os campos → INCOMPLETE_REGISTER
UPDATE workers w
SET status = 'INCOMPLETE_REGISTER', updated_at = NOW()
WHERE w.status = 'REGISTERED'
  AND w.merged_into_id IS NULL
  AND NOT (
    w.first_name_encrypted  IS NOT NULL AND w.first_name_encrypted  <> '' AND
    w.last_name_encrypted   IS NOT NULL AND w.last_name_encrypted   <> '' AND
    w.sex_encrypted         IS NOT NULL AND w.sex_encrypted         <> '' AND
    w.gender_encrypted      IS NOT NULL AND w.gender_encrypted      <> '' AND
    w.birth_date_encrypted  IS NOT NULL AND w.birth_date_encrypted  <> '' AND
    w.document_number_encrypted IS NOT NULL AND w.document_number_encrypted <> '' AND
    w.languages_encrypted   IS NOT NULL AND w.languages_encrypted   <> '' AND
    w.phone                 IS NOT NULL AND w.phone                 <> '' AND
    w.profession            IS NOT NULL AND w.profession            <> '' AND
    w.knowledge_level       IS NOT NULL AND w.knowledge_level       <> '' AND
    w.title_certificate     IS NOT NULL AND w.title_certificate     <> '' AND
    w.years_experience      IS NOT NULL AND w.years_experience      <> '' AND
    w.experience_types      IS NOT NULL AND array_length(w.experience_types, 1)    > 0 AND
    w.preferred_types       IS NOT NULL AND array_length(w.preferred_types, 1)      > 0 AND
    w.preferred_age_range   IS NOT NULL AND array_length(w.preferred_age_range, 1)  > 0 AND
    EXISTS (
      SELECT 1 FROM worker_service_areas sa
      WHERE sa.worker_id = w.id AND sa.address_line IS NOT NULL AND sa.radius_km IS NOT NULL
    ) AND
    EXISTS (
      SELECT 1 FROM worker_availability av
      WHERE av.worker_id = w.id
    ) AND
    EXISTS (
      SELECT 1 FROM worker_documents wd
      WHERE wd.worker_id = w.id
        AND wd.resume_cv_url                IS NOT NULL
        AND wd.identity_document_url        IS NOT NULL
        AND wd.criminal_record_url          IS NOT NULL
        AND wd.professional_registration_url IS NOT NULL
        AND wd.liability_insurance_url      IS NOT NULL
    )
  );
