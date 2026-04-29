# Enlite Health Solutions — Arquitetura de Bases de Dados

**Módulo:** F03 · F04 · F05 — Cadastro de Usuários  
**Versão:** 1.0 | Março 2026  
**Fonte:** Canvas v_03.png (inspeção direta) + Arquitetura de Auth definida em sessão anterior

> **Rastreabilidade:** Cada tabela, campo e sistema tem origem direta em uma tela ou decisão específica do canvas. Nada foi inventado ou presumido.

---

## Índice

1. [Visão Geral — 5 Sistemas de Storage](#1-visão-geral--5-sistemas-de-storage)
2. [Schema `iam` — Acesso e Autorização](#2-schema-iam--acesso-e-autorização)
3. [Schema `negocio` — Dados de Negócio](#3-schema-negocio--dados-de-negócio)
4. [Cloud Healthcare API — PHI (FHIR R4)](#4-cloud-healthcare-api--phi-fhir-r4)
5. [Cloud Storage (GCS) — Mídia e Arquivos](#5-cloud-storage-gcs--mídia-e-arquivos)
6. [Cloud KMS — Criptografia de Colunas PII](#6-cloud-kms--criptografia-de-colunas-pii)
7. [Índices Críticos e Integridade Referencial](#7-índices-críticos-e-integridade-referencial)
8. [Rastreabilidade — Origem de Cada Tabela nos Fluxos](#8-rastreabilidade--origem-de-cada-tabela-nos-fluxos)

---

## 1. Visão Geral — 5 Sistemas de Storage

Os três fluxos de cadastro geram dados de naturezas radicalmente diferentes. Cada tipo exige um sistema com garantias específicas de segurança, performance e conformidade.

| # | Sistema | Tipo | O que armazena |
|---|---------|------|----------------|
| 01 | **Google Cloud Identity Platform** | Managed Auth Service | Credenciais, tokens OAuth, JWTs |
| 02 | **PostgreSQL — Schema `iam`** | Relational DB · Access Layer | Usuários, roles, políticas Cerbos |
| 03 | **PostgreSQL — Schema `negocio`** | Relational DB · Business Layer | Todos os dados funcionais não-PHI |
| 04 | **Cloud Healthcare API (FHIR R4)** | Managed Healthcare · PHI Vault | Diagnósticos, recursos de paciente |
| 05 | **Cloud Storage (GCS)** | Object Storage | Fotos de perfil, vídeo de onboarding |

Cloud KMS não é um sistema de armazenamento separado — é uma camada de criptografia sobre o PostgreSQL (ver [Seção 6](#6-cloud-kms--criptografia-de-colunas-pii)).

---

### 01 — Google Cloud Identity Platform

**Por quê:** É o único sistema que pode tocar em senhas e hashes. O NestJS nunca vê credenciais brutas. HIPAA BAA elegível. Não é o Firebase Auth — produto enterprise com multi-tenancy nativo e SLA contratual.

**Armazena:**
- Credentials: email, hash de senha (F03 Caminho A — `createUserWithEmailAndPassword`)
- OAuth tokens: Google, providers futuros (F03 Caminho B — `signInWithPopup`)
- Emissão de JWT com claims: `uid`, `email`, `email_verified`
- Links de verificação de e-mail nativos — **sem código OTP manual no F03**

**NÃO armazena:** dados de negócio, perfis, PHI, qualquer coisa além de credenciais.

---

### 02 — PostgreSQL Schema `iam`

**Por quê:** Isolamento de acesso e autorização. O Cerbos usa este schema para persistir políticas dinâmicas via Admin API. O NestJS escreve via `IamService`.

**Armazena:**
- `iam.tenants` — empresas/regiões no multi-tenant
- `iam.users` — vínculo `google_uid` ↔ `tenant_id` + status
- `iam.roles` — roles por tenant
- `iam.user_roles` — mapeamento usuário → role
- Políticas Cerbos (gerenciadas pelo próprio Cerbos via Admin API)

**NÃO armazena:** dados de negócio, senhas, PHI.

---

### 03 — PostgreSQL Schema `negocio`

**Por quê:** Todos os dados funcionais dos fluxos F03/F04/F05 que não são PHI. PII sensíveis (CPF, documentos profissionais) armazenados com criptografia de coluna via Cloud KMS.

**Armazena:**
- `negocio.profiles` — perfil base de qualquer usuário (F03)
- `negocio.user_context` — produto e papel selecionados na tela final do F03
- `negocio.addresses` — endereços com lat/lng para matching geográfico
- `negocio.patient_onboardings` — dados de onboarding do F04
- `negocio.patient_proxies` — paciente de terceiro quando role = Familiar (F04)
- `negocio.scheduling_preferences` — time slots selecionados na conclusão do F04
- `negocio.providers` — perfil completo do prestador (F05)
- `negocio.provider_specialties` — especialidades multi-valor (F05)
- `negocio.provider_education` — formação acadêmica (F05)
- `negocio.provider_patient_preferences` — tipos de pacientes: experiência e desejo (F05)
- `negocio.provider_age_preferences` — faixa etária preferida de pacientes (F05)
- `negocio.provider_coverage_areas` — área de cobertura geográfica com raio (F05)

**NÃO armazena:** credenciais, PHI (diagnósticos, condições de saúde).

---

### 04 — Cloud Healthcare API (FHIR R4)

**Por quê:** O diagnóstico coletado no F04 é PHI (Protected Health Information) — protegido por HIPAA e dado sensível sob LGPD Art. 11. Não pode residir no PostgreSQL padrão. A API provê: criptografia em repouso com Cloud KMS, auditoria em Cloud Audit Logs, conformidade HIPAA com BAA, e deidentificação automática para analytics. O PostgreSQL armazena apenas a referência: `fhir_patient_id`.

**Armazena:**
- `Patient` resource — dados do paciente (self ou proxy via Familiar)
- `Condition` resource — diagnóstico coletado no F04 Step 1
- `RelatedPerson` resource — vínculo Familiar ↔ Paciente

**NÃO armazena:** dados não-PHI, credenciais, dados operacionais.

---

### 05 — Cloud Storage (GCS)

**Por quê:** Binários e mídia. As URLs são referenciadas no PostgreSQL — nunca os arquivos em si.

**Armazena:**
- Foto de perfil: usuários e prestadores (F03/F05)
- Vídeo de onboarding do prestador (F05 — assistido antes do quiz)
- Uploads futuros: documentos de habilitação profissional

**NÃO armazena:** metadados (ficam no PostgreSQL), dados estruturados.

---

## 2. Schema `iam` — Acesso e Autorização

Gerenciado em conjunto com o Cerbos. O NestJS escreve via `IamService`; o Cerbos persiste políticas via Admin API.

---

### `iam.tenants`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | `gen_random_uuid()` |
| `name` | `text` | NOT NULL | Nome da empresa/organização |
| `region` | `text` | NOT NULL | `br` \| `us` \| `eu` \| `ar` — define lei aplicável (LGPD/GDPR/HIPAA) |
| `product_type` | `text` | NOT NULL | `health` \| `saas` \| `both` — define se stack PHI é ativado |
| `status` | `text` | NOT NULL · DEFAULT `'active'` | `active` \| `suspended` |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

---

### `iam.users`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | Chave mestre que une todos os sistemas |
| `google_uid` | `text` | UNIQUE · NOT NULL | UID emitido pelo Google Identity Platform — nunca muda |
| `tenant_id` | `uuid` | FK · NOT NULL | → `iam.tenants.id` |
| `status` | `text` | NOT NULL · DEFAULT `'pending'` | `active` \| `suspended` \| `pending` |
| `email_verified` | `boolean` | NOT NULL · DEFAULT `false` | Sincronizado do JWT. Usado pelo Cerbos para Lazy Verification |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | Atualizar via trigger |

---

### `iam.roles`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `name` | `text` | NOT NULL | `admin` \| `manager` \| `viewer` \| `prestador` \| `familiar` \| `paciente` |
| `tenant_id` | `uuid` | FK · NOT NULL | → `iam.tenants.id` — roles são por tenant |
| `description` | `text` | — | Descrição legível para a tela de permissões |

---

### `iam.user_roles`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `user_id` | `uuid` | FK · NOT NULL | → `iam.users.id` · PK composta com `role_id` |
| `role_id` | `uuid` | FK · NOT NULL | → `iam.roles.id` · PK composta com `user_id` |
| `granted_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | Auditoria |
| `granted_by` | `uuid` | FK | → `iam.users.id` — quem concedeu. `NULL` = automático no registro |

---

## 3. Schema `negocio` — Dados de Negócio

Dados funcionais de todos os fluxos. PII sensíveis criptografados com Cloud KMS. Nenhum dado PHI reside aqui.

---

### 3.1 — Tabelas de Perfil Base (F03)

#### `negocio.profiles`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `user_id` | `uuid` | FK · UNIQUE · NOT NULL | → `iam.users.id` |
| `full_name` | `text` | — | Preenchido pelo OAuth Google ou vazio no cadastro manual |
| `phone` | `text` | — | Coletado em etapas posteriores (F04/F05) |
| `birth_date` | `date` | — | Coletado em etapas posteriores |
| `avatar_url` | `text` | — | URL GCS — preenchido pelo OAuth Google ou upload posterior |
| `entry_state` | `text` | — | `empty` \| `student` \| `worker` — estado pré-selecionado na landing (F03) |
| `terms_accepted_at` | `timestamptz` | — | Timestamp do aceite. `NULL` = ainda não aceitou |
| `privacy_accepted_at` | `timestamptz` | — | Timestamp do aceite da Política de Privacidade |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

#### `negocio.user_context`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `user_id` | `uuid` | FK · UNIQUE · NOT NULL | → `iam.users.id` |
| `product_type` | `text` | NOT NULL | `care` \| `clinic` — selecionado na tela final do F03 |
| `user_role` | `text` | NOT NULL | `familiar` \| `paciente` \| `prestador` — selecionado na tela final do F03 |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

#### `negocio.addresses`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `profile_id` | `uuid` | FK | → `negocio.profiles.id` — endereço do usuário. `NULL` quando é endereço de atendimento |
| `onboarding_id` | `uuid` | FK | → `negocio.patient_onboardings.id` — endereço do atendimento (F04). `NULL` quando é endereço do usuário |
| `label` | `text` | — | `principal` \| `atendimento` \| `cobrança` |
| `street` | `text` | — | — |
| `number` | `text` | — | — |
| `complement` | `text` | — | — |
| `neighborhood` | `text` | — | — |
| `city` | `text` | NOT NULL | — |
| `state` | `text` | — | — |
| `country_code` | `char(2)` | NOT NULL | ISO 3166 — `BR`, `AR`, `US`, etc. Determina lei aplicável |
| `zip_code` | `text` | — | CEP (BR) ou equivalente. Entrada do autocomplete no mapa (F04 Step 3) |
| `lat` | `decimal(10,8)` | — | Resolvido via geocoding do CEP. Usado no matching de prestadores Care |
| `lng` | `decimal(11,8)` | — | Resolvido via geocoding do CEP |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

---

### 3.2 — Tabelas de Onboarding Familiar/Paciente (F04)

#### `negocio.patient_onboardings`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `user_id` | `uuid` | FK · NOT NULL | → `iam.users.id` — quem preencheu (pode ser o Familiar) |
| `product_type` | `text` | NOT NULL | `care` \| `clinic` |
| `registration_role` | `text` | NOT NULL | `familiar` \| `paciente` — papel de quem se registra |
| `insurance_type` | `text` | NOT NULL | `plano_saude` \| `particular` \| `privado` — campo obrigatório F04 |
| `has_insurance` | `boolean` | NOT NULL | Pergunta explícita Sim/Não no wizard |
| `insurance_name` | `text` | — | Operadora do plano. Preenchido quando `has_insurance = true` |
| `insurance_card_number` | `text` | — | Número da carteirinha |
| `insurance_validity` | `date` | — | Validade do plano |
| `payment_modality` | `text` | NOT NULL | `pagamento_direto` \| `honorario` \| `co_participacao` |
| `has_co_participation` | `boolean` | — | Sub-opção da modalidade co-participação |
| `fhir_patient_id` | `text` | — | 🔗 Referência ao `Patient` resource na Cloud Healthcare API. Não armazena o dado clínico — apenas o ponteiro. |
| `completed_at` | `timestamptz` | — | `NULL` = onboarding em andamento |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

#### `negocio.patient_proxies`

Preenchida apenas quando `registration_role = 'familiar'` — dados do paciente de terceiro.

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `onboarding_id` | `uuid` | FK · UNIQUE · NOT NULL | → `negocio.patient_onboardings.id` |
| `patient_full_name` | `text` | NOT NULL | Nome do paciente terceiro |
| `patient_birth_date` | `date` | — | — |
| `patient_cpf_encrypted` | `text` | — | 🔒 AES-256-GCM via Cloud KMS — PII sensível |
| `relationship` | `text` | NOT NULL | `irmão` \| `filho` \| `pai` \| `cônjuge` \| `outro` |
| `fhir_patient_id` | `text` | — | 🔗 `Patient` resource FHIR deste paciente específico |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

#### `negocio.scheduling_preferences`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `onboarding_id` | `uuid` | FK · UNIQUE · NOT NULL | → `negocio.patient_onboardings.id` |
| `preferred_times` | `jsonb` | NOT NULL | `["08:00","09:00","14:00"]` — time slots da tela de conclusão do F04 |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

---

### 3.3 — Tabelas de Onboarding do Prestador (F05)

#### `negocio.providers`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `user_id` | `uuid` | FK · UNIQUE · NOT NULL | → `iam.users.id` |
| `first_name` | `text` | NOT NULL | — |
| `last_name` | `text` | NOT NULL | — |
| `cpf_encrypted` | `text` | NOT NULL | 🔒 AES-256-GCM via Cloud KMS |
| `birth_date` | `date` | NOT NULL | — |
| `profession` | `text` | NOT NULL | `AT` \| `Psicólogo` \| `Terapeuta Ocupacional` \| `outro` |
| `document_type` | `text` | NOT NULL | `CRP` \| `CRM` \| `CREFITO` \| `CRN` \| `CFO` \| `outro` |
| `document_number_encrypted` | `text` | NOT NULL | 🔒 AES-256-GCM via Cloud KMS |
| `knowledge_level` | `text` | — | `Intermediário` \| `Avançado` \| `Especialista` |
| `certificate_title` | `text` | — | Ex: `"Licensed em psicologia"` — campo livre do F05 |
| `supervision_area` | `text` | — | Ex: `"counseling em psicologia"` — campo livre do F05 |
| `gender_pronouns` | `text` | — | Campo opcional de identidade de gênero (F05) |
| `photo_url` | `text` | — | URL GCS: `enlite-profiles-{env}/providers/{id}/photo.jpg` |
| `quiz_passed` | `boolean` | — | `NULL` = quiz não realizado · `false` = reprovado · `true` = aprovado |
| `quiz_answers` | `jsonb` | — | Respostas completas para auditoria. Ex: `{"q1":"b","q2":"d","q3":"c","q4_1":"b","q4_2":"b","q4_3":"c","q5_1":"d"}` |
| `onboarding_completed_at` | `timestamptz` | — | `NULL` = em andamento |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

#### `negocio.provider_specialties`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `provider_id` | `uuid` | FK · NOT NULL | → `negocio.providers.id` |
| `specialty` | `text` | NOT NULL | Multi-valor — um row por especialidade adicionada no F05 |
| `is_primary` | `boolean` | NOT NULL · DEFAULT `false` | Especialidade principal para exibição em cards e matching |

#### `negocio.provider_education`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `provider_id` | `uuid` | FK · NOT NULL | → `negocio.providers.id` |
| `course` | `text` | NOT NULL | Nome do curso/graduação |
| `institution` | `text` | NOT NULL | Nome da instituição |
| `year_completed` | `integer` | — | Ano de conclusão |

#### `negocio.provider_patient_preferences`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `provider_id` | `uuid` | FK · NOT NULL | → `negocio.providers.id` |
| `patient_type` | `text` | NOT NULL | Ex: `autismo`, `ansiedade`, `depressão`, `TEA` — campo do canvas F05 |
| `has_experience` | `boolean` | NOT NULL | `"Com que tipos de pacientes você tem experiência?"` (F05 Step 2) |
| `wants_to_work` | `boolean` | NOT NULL | `"Com que tipos de pacientes você quer trabalhar?"` (F05 Step 2) |

#### `negocio.provider_age_preferences`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `provider_id` | `uuid` | FK · NOT NULL | → `negocio.providers.id` |
| `age_min` | `integer` | NOT NULL | `"Preferência de faixa etária dos pacientes"` — F05 Step 2 |
| `age_max` | `integer` | — | `NULL` = sem limite superior |

#### `negocio.provider_coverage_areas`

| Coluna | Tipo | Restrições | Observação |
|--------|------|-----------|------------|
| `id` | `uuid` | PK · NOT NULL | — |
| `provider_id` | `uuid` | FK · NOT NULL | → `negocio.providers.id` |
| `center_lat` | `decimal(10,8)` | NOT NULL | Centro da área — derivado do endereço principal do prestador |
| `center_lng` | `decimal(11,8)` | NOT NULL | — |
| `radius_km` | `integer` | NOT NULL | `5` \| `10` \| `20` \| `50` — valores exatos do slider do F05 Step 3 |
| `address_reference` | `text` | — | Texto de confirmação exibido ao lado do mapa no F05 |
| `is_active` | `boolean` | NOT NULL · DEFAULT `true` | — |
| `created_at` | `timestamptz` | NOT NULL · DEFAULT `now()` | — |

> ⚠ **PostGIS obrigatório:** o matching geográfico do F08 (Vagas) requer `CREATE EXTENSION postgis;` e um `GIST INDEX` nas colunas `center_lat`/`center_lng`. Sem PostGIS o cálculo de distância cai no application layer — menos eficiente em escala.

---

## 4. Cloud Healthcare API — PHI (FHIR R4)

O PostgreSQL armazena apenas `fhir_patient_id` como ponteiro. O conteúdo clínico reside exclusivamente na Cloud Healthcare API.

---

### FHIR Resource: `Patient`

| Campo FHIR | Tipo FHIR | Origem (Fluxo / Campo) |
|-----------|-----------|----------------------|
| `resourceType` | `string` (constante) | Sempre `"Patient"` |
| `id` | `string (uuid)` | `fhir_patient_id` referenciado em `negocio.patient_onboardings` e `negocio.patient_proxies` |
| `name[].given` | `string[]` | F04 Step 1: nome do paciente (self ou proxy via Familiar) |
| `name[].family` | `string` | F04 Step 1: sobrenome do paciente |
| `birthDate` | `date (YYYY-MM-DD)` | F04 Step 1: data de nascimento do paciente |
| `identifier[].value` | `string` | F04 Step 1: CPF — `system: "https://cnpj.info/cpf"` (Brazil) |
| `address[].postalCode` | `string` | F04 Step 3: CEP do endereço de atendimento (Care) |
| `contact[].relationship` | `CodeableConcept` | F04: vínculo do Familiar quando `role = familiar` |
| `contact[].name` | `HumanName` | F04: nome do Familiar cadastrante |

---

### FHIR Resource: `Condition`

| Campo FHIR | Tipo FHIR | Origem (Fluxo / Campo) |
|-----------|-----------|----------------------|
| `resourceType` | `string` (constante) | Sempre `"Condition"` |
| `id` | `string (uuid)` | ID único da condição/diagnóstico |
| `subject.reference` | `Reference(Patient)` | `"Patient/{fhir_patient_id}"` |
| `code.text` | `string` | F04 Step 1: campo **Diagnóstico** — texto livre do onboarding |
| `code.coding` | `Coding[]` | Código ICD-10 ou SNOMED — normalizado em backoffice quando disponível |
| `clinicalStatus` | `CodeableConcept` | `active` \| `inactive` \| `resolved` — padrão FHIR R4 |
| `recordedDate` | `dateTime` | Timestamp do preenchimento do F04 Step 1 |
| `recorder.reference` | `Reference(Practitioner)` | Futuro: referência ao profissional que confirmou |

---

### FHIR Resource: `RelatedPerson`

Criado apenas quando `registration_role = 'familiar'`.

| Campo FHIR | Tipo FHIR | Origem (Fluxo / Campo) |
|-----------|-----------|----------------------|
| `resourceType` | `string` (constante) | Sempre `"RelatedPerson"` |
| `patient.reference` | `Reference(Patient)` | Paciente ao qual este Familiar está vinculado |
| `relationship` | `CodeableConcept` | Código FHIR v3: `PRN` (pai), `SIB` (irmão), `CHILD`, `SIGOTHR`, etc. |
| `name` | `HumanName` | Nome do Familiar |
| `identifier[].value` | `string` | CPF do Familiar — `system: "https://cnpj.info/cpf"` |

---

## 5. Cloud Storage (GCS) — Mídia e Arquivos

Dois buckets com políticas de acesso distintas. As URLs são armazenadas como `text` no PostgreSQL — nunca os arquivos em si.

---

### Bucket: `enlite-profiles-{env}`

| Caminho | Conteúdo / Regra |
|---------|-----------------|
| `users/{user_id}/avatar.jpg` | Foto de perfil do usuário. Preenchido pelo OAuth Google ou upload manual. Referenciado em `negocio.profiles.avatar_url` |
| `providers/{provider_id}/photo.jpg` | Foto de perfil do prestador. Upload no F05 Step 2 — botão "Adicionar foto de perfil". Referenciado em `negocio.providers.photo_url` |

**Acesso:** Leitura via URL assinada com expiração. Escrita apenas via service account do NestJS.

---

### Bucket: `enlite-onboarding-{env}`

| Caminho | Conteúdo / Regra |
|---------|-----------------|
| `videos/prestador-onboarding-v{n}.mp4` | Vídeo obrigatório exibido no F05 Step 1 antes do quiz. Versionado (`v1`, `v2`…). Acesso via CDN assinada. |
| `docs/{provider_id}/habilitacao.pdf` | Documentos de habilitação profissional — não mapeado no canvas atual mas previsto pelo tipo de dado do F05. |

**Acesso:** `videos/` — leitura pública via CDN. `docs/` — privado, acesso por service account com escopo por `provider_id`. Nenhum bucket deve ter `allUsers` com acesso irrestrito.

---

## 6. Cloud KMS — Criptografia de Colunas PII

Não é um sistema de armazenamento separado. É uma camada de criptografia de envelope sobre o PostgreSQL.

**Padrão:** AES-256-GCM com envelope encryption. A chave de dados fica criptografada com a chave mestra do KMS. Sem a chave KMS, as colunas são texto ilegível — mesmo com acesso direto ao banco de dados.

### Colunas afetadas

| Tabela | Coluna | Dado protegido |
|--------|--------|----------------|
| `negocio.providers` | `cpf_encrypted` | CPF do prestador de serviço |
| `negocio.providers` | `document_number_encrypted` | Número do registro profissional (CRP/CRM/etc.) |
| `negocio.patient_proxies` | `patient_cpf_encrypted` | CPF do paciente de terceiro cadastrado por Familiar |

> CPFs e documentos profissionais são PII sensível com implicações legais em caso de vazamento (LGPD Art. 11, LGPD Art. 52). A criptografia de coluna é camada adicional à criptografia em repouso padrão do Cloud SQL.

---

## 7. Índices Críticos e Integridade Referencial

### Índices obrigatórios para performance

| Tabela.Coluna | Tipo de Índice | Motivo |
|--------------|---------------|--------|
| `iam.users.google_uid` | `UNIQUE INDEX` | Lookup por `google_uid` em **todo** request autenticado — crítico |
| `iam.users.tenant_id` | `INDEX` | Filtros multi-tenant frequentes |
| `iam.user_roles(user_id, role_id)` | `PK (composta)` | JOIN frequente para buscar roles do usuário |
| `negocio.profiles.user_id` | `UNIQUE INDEX` | JOIN no `/auth/sync` e em todo request com perfil |
| `negocio.user_context.user_id` | `UNIQUE INDEX` | Lookup frequente para determinar produto/papel |
| `negocio.patient_onboardings.user_id` | `INDEX` | Busca de onboardings por usuário |
| `negocio.providers.user_id` | `UNIQUE INDEX` | Lookup do prestador por `user_id` |
| `negocio.provider_coverage_areas(center_lat, center_lng)` | `GIST INDEX (PostGIS)` | Matching geográfico de prestadores (F08 — Vagas) |
| `negocio.provider_specialties.provider_id` | `INDEX` | Busca de especialidades por prestador |
| `negocio.provider_patient_preferences.provider_id` | `INDEX` | Filtro de matching por tipo de paciente |

### Relacionamentos (FK) resumidos

```
iam.tenants
  └── iam.users (tenant_id)
        └── iam.user_roles (user_id)
        └── negocio.profiles (user_id)
              └── negocio.addresses (profile_id)
        └── negocio.user_context (user_id)
        └── negocio.patient_onboardings (user_id)
              └── negocio.patient_proxies (onboarding_id)
              └── negocio.scheduling_preferences (onboarding_id)
              └── negocio.addresses (onboarding_id)
        └── negocio.providers (user_id)
              └── negocio.provider_specialties (provider_id)
              └── negocio.provider_education (provider_id)
              └── negocio.provider_patient_preferences (provider_id)
              └── negocio.provider_age_preferences (provider_id)
              └── negocio.provider_coverage_areas (provider_id)

iam.roles
  └── iam.user_roles (role_id)
```

---

## 8. Rastreabilidade — Origem de Cada Tabela nos Fluxos

Cada tabela tem origem direta em uma tela ou decisão específica do canvas. Nada foi adicionado por especulação.

| Tabela / Sistema | Fluxo | Tela / Campo de Origem |
|-----------------|-------|----------------------|
| `iam.tenants` | Arquitetura | Multi-tenancy BR/US/EU/AR definido na arquitetura de Auth |
| `iam.users` | F03 | `google_uid` do JWT + `tenant_id` ao criar conta no `POST /auth/sync` |
| `iam.roles` / `iam.user_roles` | F03 | Role default `viewer` atribuído automaticamente no `POST /auth/sync` |
| `negocio.profiles` | F03 | Tela de Criar Conta: `full_name` (OAuth), `terms_accepted_at`, `privacy_accepted_at`, `entry_state` |
| `negocio.user_context` | F03 | Tela de Seleção de Contexto (final do F03): cards Care/Clinic + Familiar/Paciente/Prestador |
| `negocio.addresses` | F04 | F04 Step 3: mapa interativo com CEP → geocoding → `lat`/`lng` |
| `negocio.patient_onboardings` | F04 | F04 Step 2: `insurance_type`, `payment_modality`, `has_insurance`, `has_co_participation` |
| `negocio.patient_proxies` | F04 | F04 Step 1: dados do paciente de terceiro quando `role = familiar` |
| `negocio.scheduling_preferences` | F04 | F04 Tela de Conclusão: seletor de horários `08:00`–`14:00` |
| `FHIR Patient` | F04 | F04 Step 1: nome, nascimento e CPF do paciente |
| `FHIR Condition` | F04 | F04 Step 1: campo **Diagnóstico** — PHI |
| `FHIR RelatedPerson` | F04 | F04 Step 1: vínculo Familiar → Paciente quando `role = familiar` |
| `negocio.providers` | F05 | F05 Step 2: formulário completo de perfil (todos os campos listados) |
| `negocio.providers.quiz_passed` / `quiz_answers` | F05 | F05 Step 1: quiz de qualificação com 5 seções e respostas corretas |
| `negocio.provider_specialties` | F05 | F05 Step 2: botão "Add" de especialidades — campo multi-valor |
| `negocio.provider_education` | F05 | F05 Step 2: campos Formação + Instituição |
| `negocio.provider_patient_preferences` | F05 | F05 Step 2: "experiência" e "quer trabalhar com" por tipo de paciente |
| `negocio.provider_age_preferences` | F05 | F05 Step 2: "Preferência de faixa etária dos pacientes" |
| `negocio.provider_coverage_areas` | F05 | F05 Step 3: mapa com slider `5` / `10` / `20` / `50` km |
| `GCS enlite-profiles-{env}` | F03 / F05 | F03: `avatar_url` do OAuth Google. F05 Step 2: "Adicionar foto de perfil" |
| `GCS enlite-onboarding-{env}` | F05 | F05 Step 1: player de vídeo de onboarding antes do quiz |
| Cloud KMS | F04 / F05 | `patient_cpf_encrypted` (F04), `cpf_encrypted` + `document_number_encrypted` (F05) |

---

*Enlite Health Solutions — Documento interno de arquitetura*  
*Derivado exclusivamente dos fluxos F03/F04/F05 (canvas v_03.png) · Março 2026*
