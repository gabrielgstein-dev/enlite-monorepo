# 📊 Queries para Cruzamento de Dados - Workers × Casos

Com a implementação da captura de CASO da aba Talentum, agora você consegue fazer os seguintes cruzamentos:

---

## 1️⃣ Quantos workers estão interessados no CASO XXX?

```sql
-- Workers que aplicaram para o CASO 694
SELECT 
  w.id,
  w.first_name_encrypted,
  w.last_name_encrypted,
  w.phone,
  w.email,
  w.funnel_stage,
  w.occupation,
  w.profession,
  wja.application_status,
  wja.applied_at,
  wja.source
FROM worker_job_applications wja
JOIN workers w ON w.id = wja.worker_id
JOIN job_postings jp ON jp.id = wja.job_posting_id
WHERE jp.case_number = 694
ORDER BY wja.applied_at DESC;
```

**Resultado:** Lista de todos os workers que se candidataram ao caso 694, com status de funnel, ocupação, profissão e quando aplicaram.

---

## 2️⃣ Em quantos casos um Worker específico está interessado?

```sql
-- Casos que o worker af0c85d4-7fc8-42cd-bb04-50c4e2a62f05 aplicou
SELECT 
  jp.case_number,
  jp.patient_name,
  jp.status AS case_status,
  jp.dependency,
  jp.priority,
  jp.is_covered,
  wja.application_status,
  wja.applied_at,
  wja.source
FROM worker_job_applications wja
JOIN job_postings jp ON jp.id = wja.job_posting_id
WHERE wja.worker_id = 'af0c85d4-7fc8-42cd-bb04-50c4e2a62f05'
ORDER BY wja.applied_at DESC;
```

**Resultado:** Lista de todos os casos que esse worker aplicou, com detalhes do caso e status da aplicação.

---

## 3️⃣ Workers QUALIFICADOS (funnel_stage = 'QUALIFIED') para casos específicos

```sql
-- Workers QUALIFIED que aplicaram para casos URGENTES
SELECT 
  jp.case_number,
  jp.patient_name,
  jp.priority,
  w.id AS worker_id,
  w.phone,
  w.email,
  w.funnel_stage,
  w.occupation,
  w.profession,
  wja.application_status,
  wja.source
FROM worker_job_applications wja
JOIN workers w ON w.id = wja.worker_id
JOIN job_postings jp ON jp.id = wja.job_posting_id
WHERE 
  w.funnel_stage = 'QUALIFIED'
  AND jp.priority = 'URGENTE'
  AND jp.status = 'active'
ORDER BY jp.case_number, w.occupation;
```

**Resultado:** Workers qualificados que aplicaram para casos urgentes e ativos.

---

## 4️⃣ Workers que aplicaram mas NÃO estão qualificados ainda

```sql
-- Workers em PRE_TALENTUM ou TALENTUM que aplicaram para casos
SELECT 
  w.id,
  w.phone,
  w.email,
  w.funnel_stage,
  w.occupation,
  COUNT(DISTINCT wja.job_posting_id) AS total_cases_applied,
  STRING_AGG(DISTINCT jp.case_number::text, ', ' ORDER BY jp.case_number::text) AS case_numbers
FROM workers w
JOIN worker_job_applications wja ON wja.worker_id = w.id
JOIN job_postings jp ON jp.id = wja.job_posting_id
WHERE w.funnel_stage IN ('PRE_TALENTUM', 'TALENTUM')
GROUP BY w.id, w.phone, w.email, w.funnel_stage, w.occupation
ORDER BY total_cases_applied DESC;
```

**Resultado:** Workers que demonstraram interesse mas ainda não completaram o processo de qualificação.

---

## 5️⃣ Matching: Workers QUALIFIED com ocupação correta para casos específicos

```sql
-- Workers AT qualificados para casos que precisam de AT
SELECT 
  jp.case_number,
  jp.patient_name,
  jp.dependency,
  w.id AS worker_id,
  w.phone,
  w.email,
  w.occupation,
  w.profession,
  wja.application_status,
  -- Verifica se já tem encuadre (entrevista) agendado
  EXISTS(
    SELECT 1 FROM encuadres e 
    WHERE e.worker_id = w.id 
    AND e.job_posting_id = jp.id
  ) AS has_interview
FROM worker_job_applications wja
JOIN workers w ON w.id = wja.worker_id
JOIN job_postings jp ON jp.id = wja.job_posting_id
WHERE 
  w.funnel_stage = 'QUALIFIED'
  AND w.occupation IN ('AT', 'AMBOS')
  AND jp.status = 'active'
ORDER BY jp.case_number, w.occupation;
```

**Resultado:** Workers qualificados com a ocupação correta (AT ou AMBOS) para casos ativos.

---

## 6️⃣ Dashboard: Resumo de aplicações por caso

```sql
-- Estatísticas de candidaturas por caso
SELECT 
  jp.case_number,
  jp.patient_name,
  jp.status AS case_status,
  jp.dependency,
  jp.priority,
  jp.is_covered,
  COUNT(DISTINCT wja.worker_id) AS total_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.funnel_stage = 'QUALIFIED') AS qualified_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.funnel_stage = 'TALENTUM') AS talentum_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.funnel_stage = 'PRE_TALENTUM') AS pre_talentum_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.occupation = 'AT') AS at_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.occupation = 'CUIDADOR') AS cuidador_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.occupation = 'AMBOS') AS ambos_applicants,
  -- Verifica se já tem entrevistas agendadas
  COUNT(DISTINCT e.id) AS total_interviews
FROM job_postings jp
LEFT JOIN worker_job_applications wja ON wja.job_posting_id = jp.id
LEFT JOIN workers w ON w.id = wja.worker_id
LEFT JOIN encuadres e ON e.job_posting_id = jp.id
WHERE jp.case_number IS NOT NULL
GROUP BY jp.id, jp.case_number, jp.patient_name, jp.status, jp.dependency, jp.priority, jp.is_covered
ORDER BY jp.case_number DESC;
```

**Resultado:** Dashboard completo com estatísticas de candidaturas por caso, segmentado por funnel_stage e occupation.

---

## 7️⃣ Workers que aplicaram para múltiplos casos

```sql
-- Workers com mais de 5 aplicações
SELECT 
  w.id,
  w.phone,
  w.email,
  w.funnel_stage,
  w.occupation,
  w.profession,
  COUNT(DISTINCT wja.job_posting_id) AS total_cases,
  STRING_AGG(DISTINCT jp.case_number::text, ', ' ORDER BY jp.case_number::text) AS case_numbers,
  -- Quantos são QUALIFIED vs total
  COUNT(DISTINCT wja.job_posting_id) FILTER (WHERE w.funnel_stage = 'QUALIFIED') AS qualified_for
FROM workers w
JOIN worker_job_applications wja ON wja.worker_id = w.id
JOIN job_postings jp ON jp.id = wja.job_posting_id
GROUP BY w.id, w.phone, w.email, w.funnel_stage, w.occupation, w.profession
HAVING COUNT(DISTINCT wja.job_posting_id) > 5
ORDER BY total_cases DESC;
```

**Resultado:** Workers que aplicaram para muitos casos (pode indicar alta disponibilidade ou interesse).

---

## 8️⃣ Casos sem candidatos QUALIFIED

```sql
-- Casos ativos sem nenhum worker qualificado
SELECT 
  jp.case_number,
  jp.patient_name,
  jp.status,
  jp.dependency,
  jp.priority,
  jp.is_covered,
  COUNT(DISTINCT wja.worker_id) AS total_applicants,
  COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.funnel_stage = 'QUALIFIED') AS qualified_applicants
FROM job_postings jp
LEFT JOIN worker_job_applications wja ON wja.job_posting_id = jp.id
LEFT JOIN workers w ON w.id = wja.worker_id
WHERE 
  jp.status = 'active'
  AND jp.case_number IS NOT NULL
GROUP BY jp.id, jp.case_number, jp.patient_name, jp.status, jp.dependency, jp.priority, jp.is_covered
HAVING COUNT(DISTINCT wja.worker_id) FILTER (WHERE w.funnel_stage = 'QUALIFIED') = 0
ORDER BY jp.priority DESC, jp.case_number;
```

**Resultado:** Casos que precisam de atenção (sem candidatos qualificados).

---

## 🎯 Resumo da Estrutura de Dados

Com a implementação, você tem 3 tabelas principais:

1. **`workers`** — dados do profissional
   - `funnel_stage`: PRE_TALENTUM | TALENTUM | QUALIFIED | BLACKLIST
   - `occupation`: AT | CUIDADOR | AMBOS
   - `profession`: texto livre ("Acompañante Terapéutico con certificado")

2. **`job_postings`** — dados do caso
   - `case_number`: número do caso
   - `patient_name`, `dependency`, `priority`, `status`

3. **`worker_job_applications`** — relacionamento N:N
   - `worker_id` + `job_posting_id`
   - `application_status`: applied | under_review | shortlisted | etc.
   - `source`: candidatos | talent_search | planilla_operativa

4. **`encuadres`** — entrevistas realizadas
   - Subset de `worker_job_applications` que chegaram na fase de entrevista
   - `resultado`: SELECCIONADO | RECHAZADO | etc.

---

## 🔍 Diferença entre `worker_job_applications` e `encuadres`

- **`worker_job_applications`**: Worker **demonstrou interesse** no caso (aplicou via Talentum/TalentSearch)
- **`encuadres`**: Worker **foi entrevistado** para o caso (tem data/hora de entrevista, resultado, etc.)

Um worker pode aplicar para 10 casos mas ser entrevistado apenas para 3.
