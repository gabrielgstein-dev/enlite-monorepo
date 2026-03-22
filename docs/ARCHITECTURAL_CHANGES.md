# Mudanças Arquiteturais - Correções Críticas

## 🎯 Problemas Identificados

### 1. ❌ CUIT/DNI sem separação de tipo
**Problema:** Atualmente temos `cuit` (plaintext) e `document_number_encrypted`, mas não sabemos se é CUIT ou DNI.

**Solução:**
- `document_type` → 'DNI' | 'CUIT' | 'PASSPORT' (plaintext, já existe)
- `document_number_encrypted` → número do documento (KMS encrypted, já existe)
- **REMOVER** `cuit` plaintext (migrar dados para document_number_encrypted com type='CUIT')

### 2. ❌ funnel_stage na tabela workers
**Problema:** `funnel_stage` está em `workers`, mas deveria ser por **candidatura** (worker × caso), não por worker global.

**Contexto:**
- Um worker pode estar QUALIFIED para um caso mas PRE_TALENTUM para outro
- O funnel_stage é específico do processo de recrutamento para cada vaga

**Solução:**
- **MOVER** `funnel_stage` de `workers` para `worker_job_applications`
- Adicionar `application_funnel_stage` em `worker_job_applications`:
  - 'APPLIED' → candidatura enviada
  - 'PRE_SCREENING' → em triagem inicial
  - 'INTERVIEW_SCHEDULED' → entrevista agendada
  - 'INTERVIEWED' → entrevistado
  - 'QUALIFIED' → aprovado para a vaga
  - 'REJECTED' → rejeitado
  - 'HIRED' → contratado

### 3. ❌ Endereços não estão em worker_service_areas
**Problema:** Campos de endereço (Domicilio, ZONA) não estão sendo capturados nem geocodificados.

**Solução:**
- Extrair `Domicilio` (Ana Care) → geocodificar com Google Maps API
- Extrair `ZONA` e `ZONA INTERÉS` (NoTerminaronTalentum) → geocodificar
- Salvar em `worker_service_areas` com:
  - `city`, `state`, `country`
  - `latitude`, `longitude`
  - `radius_km`
  - `is_preferred` (true para ZONA INTERÉS)

### 4. ⚠️ Estratégia KMS - Duplicação de colunas
**Problema:** Não está claro quais campos precisam de AMBAS as colunas (plaintext + encrypted).

**Decisão Arquitetural:**

#### Campos que precisam AMBOS (plaintext + encrypted):
- `email` / `email_encrypted` → plaintext para dedup/login, encrypted para LGPD
- `phone` / `phone_encrypted` → plaintext para dedup/lookup, encrypted para LGPD

#### Campos que precisam APENAS encrypted:
- `first_name_encrypted` (sem plaintext)
- `last_name_encrypted` (sem plaintext)
- `birth_date_encrypted` (sem plaintext)
- `sex_encrypted` (sem plaintext)
- `document_number_encrypted` (sem plaintext)
- `profile_photo_url_encrypted` (sem plaintext)
- `linkedin_url_encrypted` (NOVO - sem plaintext)

#### Campos que ficam APENAS plaintext (não são PII):
- `document_type` → tipo do documento, não o número
- `occupation` → categoria profissional pública
- `profession` → descrição da profissão (texto livre do Excel)
- `country`, `timezone` → dados públicos
- `ana_care_id` → ID externo público

#### Campos que devem ser REMOVIDOS (plaintext):
- ~~`cuit`~~ → migrar para `document_number_encrypted` com `document_type='CUIT'`
- ~~`funnel_stage`~~ → mover para `worker_job_applications.application_funnel_stage`

## 📋 Campos Faltantes para Capturar

### Alta Prioridade (schema já existe):
1. **`linkedin_url`** → Existe em:
   - NoTerminaronTalentum (coluna "Linkedin")
   - TalentSearch CSV (coluna "Linkedin")
   - Salvar em `linkedin_url_encrypted`

2. **`birth_date`** → Existe em:
   - NoTerminaronTalentum (coluna "FEC NAC")
   - Salvar em `birth_date_encrypted`

3. **`sex`** → Existe em:
   - NoTerminaronTalentum (coluna "SEXO")
   - Salvar em `sex_encrypted`

### Média Prioridade (criar novos campos):
4. **Endereços** → Extrair e geocodificar:
   - Ana Care: "Domicilio"
   - NoTerminaronTalentum: "ZONA", "ZONA INTERÉS"
   - Salvar em `worker_service_areas`

5. **Datas administrativas** (criar tabela `worker_employment_history`):
   - Ana Care: "Fecha de alta", "Fecha de baja", "Razon de baja"
   - Campos: `hired_at`, `terminated_at`, `termination_reason`

6. **Delegación/Sucursal** (Ana Care):
   - Criar campo `branch_office` em workers (plaintext, não é PII)

## 🔄 Migrations Necessárias

### Migration 026: Fix document_type and remove cuit
```sql
-- 1. Migrar dados de cuit para document_number_encrypted
UPDATE workers
SET document_type = 'CUIT',
    document_number_encrypted = encrypt_with_kms(cuit)
WHERE cuit IS NOT NULL AND document_number_encrypted IS NULL;

-- 2. Remover coluna cuit
ALTER TABLE workers DROP COLUMN IF EXISTS cuit;

-- 3. Garantir que document_type é obrigatório quando há document_number
ALTER TABLE workers
  ADD CONSTRAINT check_document_type_required
  CHECK (document_number_encrypted IS NULL OR document_type IS NOT NULL);
```

### Migration 027: Move funnel_stage to worker_job_applications
```sql
-- 1. Adicionar application_funnel_stage em worker_job_applications
ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS application_funnel_stage VARCHAR(30) DEFAULT 'APPLIED'
  CHECK (application_funnel_stage IN (
    'APPLIED', 'PRE_SCREENING', 'INTERVIEW_SCHEDULED', 
    'INTERVIEWED', 'QUALIFIED', 'REJECTED', 'HIRED'
  ));

-- 2. Migrar dados existentes (se houver lógica de mapeamento)
-- Exemplo: workers com funnel_stage='QUALIFIED' → applications com 'QUALIFIED'
UPDATE worker_job_applications wja
SET application_funnel_stage = 'QUALIFIED'
FROM workers w
WHERE wja.worker_id = w.id AND w.funnel_stage = 'QUALIFIED';

-- 3. Remover funnel_stage de workers
ALTER TABLE workers DROP COLUMN IF EXISTS funnel_stage;
```

### Migration 028: Add linkedin_url_encrypted
```sql
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS linkedin_url_encrypted TEXT;

COMMENT ON COLUMN workers.linkedin_url_encrypted IS 'LinkedIn profile URL — KMS encrypted';
```

### Migration 029: Add branch_office and employment history
```sql
-- 1. Branch office (não é PII)
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS branch_office VARCHAR(100);

-- 2. Tabela de histórico de emprego
CREATE TABLE IF NOT EXISTS worker_employment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  
  hired_at DATE,
  terminated_at DATE,
  termination_reason TEXT,
  
  employment_type VARCHAR(50), -- 'ana_care', 'enlite', 'other'
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_worker_employment_history_worker ON worker_employment_history(worker_id);
```

## 🔧 Mudanças no Código de Import

### WorkerRepository.updateFromImport
**ANTES:**
```typescript
cuit: 'cuit',
profession: 'profession',
```

**DEPOIS:**
```typescript
profession: 'profession',
branchOffice: 'branch_office',
// cuit removido - usar documentType + documentNumber
```

### import-planilhas.ts - Ana Care
**ADICIONAR:**
```typescript
// Document type/number
const cuitValue = cleanString(col(row, 'Número de cédula', 'CUIT', 'cedula'));
const documentType = cuitValue ? 'CUIT' : null;
const documentNumber = cuitValue;

// Address
const domicilio = cleanString(col(row, 'Domicilio'));

// Employment
const fechaAlta = parseExcelDate(col(row, 'Fecha de alta'));
const fechaBaja = parseExcelDate(col(row, 'Fecha de baja'));
const razonBaja = cleanString(col(row, 'Razon de baja'));

// Branch
const branchOffice = cleanString(col(row, 'Delegación', 'Sucursal'));

await upsertWorker({
  documentType,
  documentNumber,
  branchOffice,
  address: domicilio, // geocodificar depois
  // ...
});

// Salvar employment history se houver
if (fechaAlta || fechaBaja) {
  await employmentHistoryRepo.upsert({
    workerId,
    hiredAt: fechaAlta,
    terminatedAt: fechaBaja,
    terminationReason: razonBaja,
    employmentType: 'ana_care',
  });
}
```

### import-planilhas.ts - NoTerminaronTalentum
**ADICIONAR:**
```typescript
const linkedinUrl = cleanString(col(row, 'Linkedin'));
const birthDate = parseExcelDate(col(row, 'FEC NAC'));
const sex = cleanString(col(row, 'SEXO'));
const zona = cleanString(col(row, 'ZONA'));
const zonaInteres = cleanString(col(row, 'ZONA INTERÉS'));

await upsertWorker({
  linkedinUrl,
  birthDate,
  sex,
  // ...
});

// Geocodificar zonas
if (zona || zonaInteres) {
  await geocodeAndSaveServiceAreas(workerId, zona, zonaInteres);
}
```

### import-planilhas.ts - TalentSearch CSV
**ADICIONAR:**
```typescript
const linkedinUrl = cleanString(col(row, 'Linkedin'));

await upsertWorker({
  linkedinUrl,
  // ...
});
```

## 📊 Resumo de Impacto

### Campos Removidos:
- `workers.cuit` → migrado para `document_number_encrypted`
- `workers.funnel_stage` → movido para `worker_job_applications.application_funnel_stage`

### Campos Adicionados:
- `workers.linkedin_url_encrypted`
- `workers.branch_office`
- `worker_employment_history` (tabela nova)
- `worker_job_applications.application_funnel_stage`

### Campos a Capturar (já existem no schema):
- `birth_date_encrypted` (NoTerminaronTalentum)
- `sex_encrypted` (NoTerminaronTalentum)
- `linkedin_url_encrypted` (NoTerminaronTalentum + TalentSearch)

### Geocodificação Necessária:
- Ana Care: "Domicilio"
- NoTerminaronTalentum: "ZONA", "ZONA INTERÉS"
- Salvar em `worker_service_areas`

## ⚠️ Decisões Pendentes

1. **Google Maps API**: Precisamos configurar a API key para geocodificação?
2. **Migration 023**: Já foi aplicada em produção? (remove plaintext PII)
3. **Backward compatibility**: Manter `cuit` temporariamente com deprecation warning?
4. **funnel_stage global**: Criar um campo `overall_status` em workers para status geral?
