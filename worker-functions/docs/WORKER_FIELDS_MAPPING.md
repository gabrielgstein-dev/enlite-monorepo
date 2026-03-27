# Worker Fields Mapping

Documentação de onde cada campo é coletado no fluxo do worker.

## 📋 Fluxo de Coleta de Dados

### **FASE 1: Registro Inicial (3 Steps) - Tela Atual**

Tela: `WorkerRegistrationPage.tsx`

#### **Step 1: General Info**
Campos coletados e salvos em `workers`:
- `email` ✅
- `phone` ✅
- `first_name` ✅ (extraído de fullName)
- `last_name` ✅ (extraído de fullName)
- `birth_date` ✅
- `document_type` ✅ (hardcoded 'CPF')
- `document_number` ✅
- `profile_photo_url` ✅

**Campos NÃO coletados neste step** (serão coletados na tela de documentos):
- `sex`
- `gender`
- `sexual_orientation`
- `race`
- `religion`
- `languages`
- `weight_kg`
- `height_cm`
- `profession`
- `knowledge_level`
- `title_certificate`
- `experience_types`
- `years_experience`
- `preferred_types`
- `preferred_age_range`
- `diagnostic_preferences`
- `hobbies`
- `linkedin_url`
- `terms_accepted_at`
- `privacy_accepted_at`

#### **Step 2: Service Address**
Campos coletados e salvos em `worker_service_areas`:
- `address` (address_line) ✅
- `address_complement` ✅
- `service_radius_km` (radius_km) ✅
- `lat` ✅ (atualmente hardcoded 0)
- `lng` ✅ (atualmente hardcoded 0)

**Campo NÃO persistido:**
- `accepts_remote_service` (apenas UI local)

#### **Step 3: Availability**
Campos coletados e salvos em `worker_availability`:
- `day_of_week` ✅
- `start_time` ✅
- `end_time` ✅

---

### **FASE 2: Tela de Documentos (FUTURA)**

Tela: `DocumentsUploadPage.tsx` (a ser criada)

#### **Campos Demográficos Estendidos**
Salvos em `workers`:
- `sex` (select: Masculino/Feminino/Outro)
- `gender` (select: Masculino/Feminino/Cisgênero/etc)
- `sexual_orientation` (select: Heterosexual/Homossexual/etc)
- `race` (select: Branco/Pardo/Negro/etc)
- `religion` (select: Católica/Protestante/etc)
- `languages` (multi-select: Português/Espanhol/Inglês/etc)
- `weight_kg` (number input)
- `height_cm` (number input)

#### **Campos Profissionais Estendidos**
Salvos em `workers`:
- `profession` (select: Cuidador/Enfermeiro/Psicólogo/etc)
- `knowledge_level` (select: Bacharelado/Técnico/Mestrado/etc)
- `title_certificate` (text input)
- `experience_types` (multi-select: Idosos/Crianças/TDAH/etc)
- `years_experience` (select: 0-2/3-5/6-10/10+)
- `preferred_types` (multi-select)
- `preferred_age_range` (select: Crianças/Adolescentes/Adultos/Idosos)
- `diagnostic_preferences` (multi-select: AAD2.5/Transtorno do espectro autista/etc)
- `hobbies` (multi-select: Assistir eventos culturais/Cozinhar/etc)
- `linkedin_url` (text input)

#### **Documentos (Upload de PDFs)**
Salvos em `worker_documents`:
- `resume_cv_url` (upload PDF)
- `identity_document_url` (upload PDF - DNI/RG/CPF)
- `criminal_record_url` (upload PDF - Antecedentes penais)
- `professional_registration_url` (upload PDF - AFIP/CRM/COREN)
- `liability_insurance_url` (upload PDF - Seguro responsabilidade civil)
- `additional_certificates_urls` (array de uploads PDF - certificados extras)

#### **Termos e Privacidade**
Salvos em `workers`:
- `terms_accepted_at` (checkbox + timestamp)
- `privacy_accepted_at` (checkbox + timestamp)

---

### **FASE 3: Dados Financeiros (FUTURA)**

Tela: `PaymentInfoPage.tsx` (a ser criada)

Salvos em `worker_payment_info`:
- `country` (select: AR/BR)
- `account_holder_name` (text input - Titular)
- `tax_id` (text input - CUIT/CUIL/CPF)
- `bank_name` (text input - Banco)
- `bank_branch` (text input - Agência)
- `account_number` (text input - Conta corrente)
- `account_type` (select: checking/savings)
- `pix_key` (text input - PIX/CVU/Alias)

---

## 🔒 Regras de Negócio

### **Candidatura a Vagas**
Worker **SÓ PODE** se candidatar a vagas se:
1. ✅ Completou registro inicial (3 steps)
2. ✅ Enviou TODOS os 5 documentos obrigatórios
3. ✅ `worker_documents.documents_status = 'approved'`

### **Status do Worker**
- `pending`: Criado mas não completou registro
- `in_progress`: Completando wizard de 3 steps
- `review`: Completou wizard, aguardando envio de documentos
- `approved`: Documentos aprovados, pode se candidatar a vagas
- `rejected`: Documentos rejeitados

### **Status dos Documentos**
- `pending`: Worker ainda não enviou
- `incomplete`: Faltam documentos
- `submitted`: Todos enviados, aguardando revisão
- `under_review`: Em análise
- `approved`: ✅ Aprovado, pode se candidatar
- `rejected`: ❌ Rejeitado, precisa reenviar

---

## 📊 Resumo de Tabelas

| Tabela | Campos | Quando é Preenchida |
|--------|--------|---------------------|
| `workers` | Dados pessoais e profissionais | Registro (parcial) + Documentos (completo) |
| `worker_service_areas` | Endereço e raio de atendimento | Step 2 do registro |
| `worker_availability` | Horários disponíveis | Step 3 do registro |
| `worker_documents` | URLs dos documentos | Tela de documentos |
| `worker_payment_info` | Dados bancários | Tela de pagamento |
| `worker_job_applications` | Candidaturas a vagas | Após aprovação de documentos |

---

## 🚀 Próximos Passos de Implementação

1. ✅ Migrations criadas (008, 009, 010, 011)
2. ⏳ Rodar migrations no banco de dados
3. ⏳ Criar DTOs para novos campos
4. ⏳ Atualizar repositories
5. ⏳ Criar endpoints para documentos
6. ⏳ Criar tela de upload de documentos
7. ⏳ Implementar guard de candidatura
8. ⏳ Criar sistema de vagas e candidaturas
