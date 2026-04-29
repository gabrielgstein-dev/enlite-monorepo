# BLOCO 6 — MICROSERVIÇOS: DECOMPOSIÇÃO, CONTAINERS, ORQUESTRAÇÃO E ISOLAMENTO POR SERVICE ACCOUNT

**EnLite Health Solutions — Arquitetura e Implementação**  
**Continuação do documento principal (Blocos 0-5)**  
**Jurisdições:** LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)

**Fontes de compliance consultadas nesta iteração:**
- HIPAA Security Rule (45 CFR 164.308-316) — vigente, conforme hhs.gov/hipaa
- HIPAA Security Rule NPRM (Dez/2024) — proposta de fortalecimento, publicada em hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm
- OCR Cybersecurity Newsletter Jan/2026 — system hardening e security baselines
- OCR Cybersecurity Newsletter Summer/2021 — Information Access Management e Access Control
- HHS Guidance on HIPAA & Cloud Computing — BAA com CSPs
- HIPAA Audit Controls (45 CFR 164.312(b)) — mecanismos de registro e exame de atividade
- LGPD: Guia de Boas Práticas (Gov.BR), Lei 13.709/2018 — Arts. 5, 6, 11, 18, 38, 41, 46
- GDPR: Arts. 5, 25, 28, 30, 32, 35
- Ley 25.326 (Argentina): Arts. 2, 7, 9, 12

---

## 6.0 — Princípios Arquiteturais de Compliance para Microserviços

Antes de detalhar cada serviço, é fundamental documentar os princípios que governam TODAS as decisões deste bloco. Cada princípio é rastreável a um requisito regulatório específico.

### 6.0.1 — Princípio do Menor Privilégio (Least Privilege)

Cada microserviço recebe APENAS as permissões estritamente necessárias para sua função. Nenhum serviço possui acesso amplo ao banco, ao FHIR store, ou ao Cloud Storage.

**Fundamentação regulatória:**

- **HIPAA Security Rule — 45 CFR 164.312(a)(1):** Exige controles técnicos de acesso que permitam acesso a ePHI apenas a pessoas e programas autorizados. Conforme publicado em hhs.gov, o padrão de Access Control requer que entidades reguladas implementem políticas técnicas que restrinjam acesso ao mínimo necessário.
- **HIPAA Security Rule — 45 CFR 164.308(a)(4):** O padrão de Information Access Management exige políticas e procedimentos para autorizar acesso a ePHI consistentes com as regras da Privacy Rule.
- **HIPAA Privacy Rule — 45 CFR 164.514(d):** Princípio de "minimum necessary" — cada ator só acessa o que é estritamente necessário para sua função.
- **HIPAA NPRM (Dez/2024):** A proposta de fortalecimento elimina a distinção entre implementações "required" e "addressable", tornando TODOS os requisitos obrigatórios (com exceções limitadas e específicas). Isso inclui criptografia, MFA, segmentação de rede.
- **LGPD Art. 6, III:** Princípio da necessidade — limitação do tratamento ao mínimo necessário para a realização de suas finalidades.
- **GDPR Art. 5(1)(c):** Princípio da minimização de dados.
- **GDPR Art. 25:** Data protection by design and by default.

**Implementação na EnLite:** Cada microserviço possui seu próprio GCP Service Account com IAM roles granulares. No PostgreSQL, cada serviço possui um database role com permissões restritas ao schema e tabelas necessárias via Row-Level Security.

### 6.0.2 — Princípio da Segmentação de Rede

Microserviços que processam ePHI são isolados em subnets separadas com firewalls restritivos.

**Fundamentação regulatória:**

- **HIPAA NPRM (Dez/2024):** Propõe exigir explicitamente segmentação de rede como requisito obrigatório, não mais como prática recomendada. Conforme publicado em hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm, a regra proposta inclui "require network segmentation" entre os novos requisitos técnicos.
- **OCR Cybersecurity Newsletter (Summer/2021):** Reconhece que firewalls, segmentação de rede, e network access control (NAC) são meios eficazes de limitar acesso a sistemas contendo ePHI.
- **HIPAA Security Rule — 45 CFR 164.312(e)(1):** Transmission security — proteção de ePHI durante transmissão em rede eletrônica.
- **LGPD Art. 46:** O agente de tratamento deve adotar medidas de segurança técnicas e administrativas aptas a proteger dados pessoais.

**Implementação na EnLite:** VPC com 5 subnets (detalhadas no Bloco 2 do documento v2). Kubernetes Network Policies restringem comunicação pod-a-pod. Istio service mesh impõe mTLS obrigatório entre todos os serviços.

### 6.0.3 — Princípio da Auditoria Completa

Todo acesso a dados sensíveis (PHI, PII) é registrado em logs imutáveis e auditáveis.

**Fundamentação regulatória:**

- **HIPAA Security Rule — 45 CFR 164.312(b):** Exige mecanismos (hardware, software e/ou procedurais) que registrem e examinem atividade em sistemas que contenham ou usem ePHI. Conforme publicado pelo OCR em hhs.gov, os audit controls incluem application audit trails (monitorar ações em registros com ePHI) e system-level audit trails (log-on, tentativas de acesso).
- **HIPAA NPRM (Dez/2024):** Propõe exigir inventário de ativos de tecnologia e mapa de rede documentados e revisados a cada 12 meses, auditorias de compliance anuais, e verificação escrita de business associates sobre conformidade.
- **LGPD Art. 6, X:** Princípio da responsabilização e prestação de contas.
- **LGPD Art. 38:** A ANPD pode determinar que o controlador elabore RIPD, incluindo descrição dos processos de tratamento e medidas de segurança.
- **GDPR Art. 30:** Records of Processing Activities — registro das atividades de tratamento.
- **GDPR Art. 5(2):** Princípio da accountability.

**Implementação na EnLite:** Schema `compliance` com tabelas append-only (access_logs, permission_audit_log). pgAudit habilitado em todos os schemas. Cloud Audit Logs para Healthcare API. Retenção mínima de 6 anos (HIPAA 45 CFR 164.316).

### 6.0.4 — Princípio da Criptografia Universal

Todos os dados são criptografados em repouso e em trânsito, sem exceção.

**Fundamentação regulatória:**

- **HIPAA NPRM (Dez/2024):** Propõe "require encryption of ePHI at rest and in transit, with limited exceptions." Isso elimina a classificação anterior de criptografia como "addressable" (agora será "required").
- **HIPAA Security Rule — 45 CFR 164.312(a)(2)(iv):** Encryption and decryption — mecanismo para criptografar e descriptografar ePHI.
- **HIPAA Security Rule — 45 CFR 164.312(e)(2)(ii):** Encryption para transmissão.
- **LGPD Art. 46:** Medidas técnicas de segurança.
- **GDPR Art. 32(1)(a):** Pseudonymization and encryption of personal data.

**Implementação na EnLite:** TLS 1.3 obrigatório em todos os endpoints. mTLS via Istio entre serviços. CMEK (Customer-Managed Encryption Keys) via Cloud KMS para Cloud SQL, GCS, e Healthcare API. Colunas PII sensíveis com AES-256-GCM envelope encryption.

### 6.0.5 — Princípio da Recuperação em 72 Horas

Planos de contingência devem garantir restauração de sistemas críticos em até 72 horas.

**Fundamentação regulatória:**

- **HIPAA NPRM (Dez/2024):** Propõe "establish written procedures to restore the loss of certain relevant electronic information systems and data within 72 hours."
- **HIPAA Security Rule — 45 CFR 164.308(a)(7):** Contingency plan — procedimentos para responder a emergências que afetem sistemas com ePHI.
- **GDPR Art. 32(1)(c):** Capacidade de restabelecer a disponibilidade e o acesso aos dados pessoais de forma atempada no caso de incidente.

**Implementação na EnLite:** Backups automáticos com retenção de 365 dias. Point-in-Time Recovery. Multi-AZ para Cloud SQL. GKE regional com auto-healing. Runbooks documentados por serviço.

---

## 6.1 — Inventário de Microserviços e Mapeamento de Dados

A tabela abaixo documenta cada microserviço, os dados que acessa, o nível de classificação dos dados, e os requisitos regulatórios aplicáveis. Este inventário atende ao requisito da HIPAA NPRM de manter um "technology asset inventory" documentado.

| # | Microserviço | Bounded Context (DDD) | Dados Acessados | Classificação | Regulamentações Aplicáveis |
|---|---|---|---|---|---|
| 1 | `auth-service` | Identity | Schema `iam` (users, tenants, roles) | PII | HIPAA 164.312(d), LGPD Art. 46, GDPR Art. 32 |
| 2 | `profile-service` | Profile | Schema `negocio` (profiles, user_context, addresses) | PII | HIPAA 164.514(d), LGPD Arts. 6/11, GDPR Art. 5 |
| 3 | `patient-service` | Patient | Schema `negocio` (patient_onboardings, proxies, scheduling) | PII + ponteiro PHI | HIPAA 164.312(a), LGPD Art. 11, GDPR Art. 9 |
| 4 | `provider-service` | Provider | Schema `negocio` (providers, coverage_areas, quiz) | PII Sensível | HIPAA 164.308(a)(4), LGPD Art. 11, GDPR Art. 9 |
| 5 | `phi-service` | Clinical | Cloud Healthcare API (FHIR R4) EXCLUSIVAMENTE | **PHI** | HIPAA 164.312 (todos), LGPD Art. 11, GDPR Art. 9 |
| 6 | `consent-service` | Consent | Schema `compliance` (consents) + FHIR Consent | Compliance | HIPAA 164.308(a)(4), LGPD Art. 8, GDPR Art. 7 |
| 7 | `payer-service` | Payer | Schema `negocio` (organizations, plans, eligibility, contracts) | PII + Comercial | HIPAA 164.514(d), LGPD Art. 6, GDPR Art. 5 |
| 8 | `permission-service` | Authorization | Schema `iam` (permissions, screen/component/field configs) | IAM | HIPAA 164.308(a)(4), LGPD Art. 46, GDPR Art. 32 |
| 9 | `audit-service` | Compliance | BigQuery + Cloud Logging + Schema `compliance` (append-only) | Audit | HIPAA 164.312(b), LGPD Art. 38, GDPR Art. 30 |
| 10 | `notification-service` | Notification | Redis (fila) + Templates (sem PHI/PII persistidos) | Operacional | HIPAA 164.312(e), LGPD Art. 46, GDPR Art. 32 |
| 11 | `media-service` | Media | Cloud Storage (GCS) — fotos, documentos | PII (mídia) | HIPAA 164.310(d), LGPD Art. 46, GDPR Art. 32 |
| 12 | `scheduler-service` | Matching | Schema `negocio` (read-only: providers, patients, scheduling) + Redis | Operacional | HIPAA 164.514(d), LGPD Art. 6, GDPR Art. 5 |
| 13 | `analytics-service` | Analytics | BigQuery (dados de-identified APENAS) | Anonimizado | HIPAA 164.514(a-b), LGPD Art. 12, GDPR Rec. 26 |
| 14 | `backoffice-bff` | Backoffice | Agrega via gRPC (NÃO acessa bancos diretamente) | Agregado | HIPAA 164.312(a), LGPD Art. 46, GDPR Art. 32 |

---

## 6.2 — GCP Service Accounts: Um por Microserviço

Cada microserviço roda com um GCP Service Account dedicado. NENHUM service account compartilha permissões com outro. Isso implementa o princípio de menor privilégio e cria blast radius isolation — se um serviço for comprometido, o atacante NÃO obtém acesso a dados de outros serviços.

**Fundamentação regulatória:**

- **HIPAA Security Rule — 45 CFR 164.312(a):** Access control — cada programa (serviço) acessa apenas os sistemas necessários para sua função.
- **HIPAA NPRM (Dez/2024):** Propõe notificação em 24 horas quando acesso de workforce member (ou programa) a ePHI é alterado ou encerrado.
- **OCR Cybersecurity Newsletter (Jan/2026):** Exige security baselines (conjunto padronizado de controles de segurança) para cada tipo de sistema, incluindo servidores e máquinas virtuais.

### Tabela de Service Accounts e IAM Roles

```bash
# ─────────────────────────────────────────────────────────
# 1. auth-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create auth-service-sa \
  --display-name="Auth Service" \
  --project=enlite-prod-services

# Permissões: Identity Platform admin, leitura de secrets
gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:auth-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/identityplatform.admin"

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:auth-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Cloud SQL: conecta via IAM auth (sem password)
gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:auth-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# NÃO tem: roles/healthcare.*, roles/storage.*, roles/bigquery.*


# ─────────────────────────────────────────────────────────
# 2. profile-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create profile-service-sa \
  --display-name="Profile Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:profile-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:profile-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Acesso a Cloud KMS para criptografia de PII sensível
gcloud kms keys add-iam-policy-binding pii-encryption-key \
  --keyring=enlite-keys --location=us-east1 \
  --member="serviceAccount:profile-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=enlite-shared-infra

# NÃO tem: roles/healthcare.*, roles/storage.objectAdmin


# ─────────────────────────────────────────────────────────
# 3. patient-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create patient-service-sa \
  --display-name="Patient Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:patient-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:patient-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# KMS para criptografia de CPF de pacientes
gcloud kms keys add-iam-policy-binding pii-encryption-key \
  --keyring=enlite-keys --location=us-east1 \
  --member="serviceAccount:patient-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=enlite-shared-infra

# Pub/Sub para publicar eventos patient.onboarded
gcloud pubsub topics add-iam-policy-binding patient-events \
  --member="serviceAccount:patient-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=enlite-prod

# NÃO tem: roles/healthcare.* (CRÍTICO — patient-service NÃO acessa FHIR diretamente)


# ─────────────────────────────────────────────────────────
# 4. provider-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create provider-service-sa \
  --display-name="Provider Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:provider-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:provider-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# KMS para documentos profissionais criptografados
gcloud kms keys add-iam-policy-binding pii-encryption-key \
  --keyring=enlite-keys --location=us-east1 \
  --member="serviceAccount:provider-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=enlite-shared-infra

gcloud pubsub topics add-iam-policy-binding provider-events \
  --member="serviceAccount:provider-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=enlite-prod

# NÃO tem: roles/healthcare.*


# ─────────────────────────────────────────────────────────
# 5. phi-service (SERVIÇO MAIS RESTRITO E MAIS AUDITADO)
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create phi-service-sa \
  --display-name="PHI Service - FHIR Access Only" \
  --project=enlite-prod-services

# ÚNICO serviço com acesso ao FHIR store
gcloud healthcare datasets add-iam-policy-binding enlite-health-prod \
  --location=us-east1 \
  --member="serviceAccount:phi-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/healthcare.fhirResourceEditor" \
  --project=enlite-data-prod

# KMS para CMEK do Healthcare dataset
gcloud kms keys add-iam-policy-binding healthcare-key \
  --keyring=enlite-keys --location=us-east1 \
  --member="serviceAccount:phi-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=enlite-shared-infra

gcloud pubsub topics add-iam-policy-binding phi-events \
  --member="serviceAccount:phi-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=enlite-prod

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:phi-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# NÃO tem: roles/cloudsql.client (phi-service NÃO acessa PostgreSQL)
# NÃO tem: roles/storage.* (NÃO acessa GCS)
# NENHUM OUTRO service account tem roles/healthcare.*


# ─────────────────────────────────────────────────────────
# 6. consent-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create consent-service-sa \
  --display-name="Consent Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:consent-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Acesso limitado ao FHIR: SOMENTE Consent resources (via custom role)
gcloud iam roles create fhirConsentEditor \
  --project=enlite-prod-services \
  --title="FHIR Consent Editor" \
  --description="Read/write FHIR Consent resources only" \
  --permissions="healthcare.fhirResources.create,healthcare.fhirResources.read,healthcare.fhirResources.update"

# Aplicado com condição de resource type (via IAM Conditions no FHIR store)
# Na prática, o consent-service chama o phi-service via gRPC para operações FHIR
# Esta é uma camada adicional de segurança

gcloud pubsub topics add-iam-policy-binding consent-events \
  --member="serviceAccount:consent-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=enlite-prod


# ─────────────────────────────────────────────────────────
# 7. payer-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create payer-service-sa \
  --display-name="Payer Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:payer-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:payer-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# NÃO tem: roles/healthcare.* (payer NUNCA acessa FHIR diretamente)
# Payer acessa PHI somente via phi-service com filtro minimum necessary


# ─────────────────────────────────────────────────────────
# 8. permission-service (usa service account privilegiado)
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create permission-admin-sa \
  --display-name="Permission Service - IAM Schema Admin" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:permission-admin-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Este é o ÚNICO service account que pode ESCREVER no schema iam.permissions
# app_service (usado pelos outros serviços) pode apenas LER


# ─────────────────────────────────────────────────────────
# 9. audit-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create audit-service-sa \
  --display-name="Audit Service" \
  --project=enlite-prod-services

# BigQuery para escrita de audit logs e analytics
gcloud projects add-iam-policy-binding enlite-audit \
  --member="serviceAccount:audit-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding enlite-audit \
  --member="serviceAccount:audit-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# Cloud Logging para leitura
gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:audit-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:audit-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Pub/Sub subscriber para eventos de auditoria
gcloud pubsub subscriptions add-iam-policy-binding audit-subscription \
  --member="serviceAccount:audit-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber" \
  --project=enlite-prod

# NÃO tem: roles/healthcare.* (não acessa FHIR)
# NÃO tem: roles/cloudsql.admin (não pode alterar schema)


# ─────────────────────────────────────────────────────────
# 10. notification-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create notification-service-sa \
  --display-name="Notification Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:notification-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Pub/Sub subscriber
gcloud pubsub subscriptions add-iam-policy-binding notification-subscription \
  --member="serviceAccount:notification-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber" \
  --project=enlite-prod

# NÃO tem: roles/cloudsql.* (não acessa banco — usa Redis para fila)
# NÃO tem: roles/healthcare.* (NUNCA processa PHI)
# IMPORTANTE: Templates de notificação NUNCA contêm PHI


# ─────────────────────────────────────────────────────────
# 11. media-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create media-service-sa \
  --display-name="Media Service" \
  --project=enlite-prod-services

# GCS para upload/download de mídia
gsutil iam ch \
  serviceAccount:media-service-sa@enlite-prod-services.iam.gserviceaccount.com:roles/storage.objectAdmin \
  gs://enlite-profiles-prod

gsutil iam ch \
  serviceAccount:media-service-sa@enlite-prod-services.iam.gserviceaccount.com:roles/storage.objectAdmin \
  gs://enlite-documents-prod

# KMS para signed URLs
gcloud kms keys add-iam-policy-binding media-signing-key \
  --keyring=enlite-keys --location=us-east1 \
  --member="serviceAccount:media-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudkms.signerVerifier" \
  --project=enlite-shared-infra

# NÃO tem: roles/healthcare.* (não acessa FHIR)
# NÃO tem: roles/cloudsql.* (não acessa banco)


# ─────────────────────────────────────────────────────────
# 12. scheduler-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create scheduler-service-sa \
  --display-name="Scheduler Service" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-data-prod \
  --member="serviceAccount:scheduler-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# READ-ONLY no banco (scheduler não escreve dados de paciente/provider)
# Permissões granulares no PostgreSQL via database role read-only

gcloud pubsub topics add-iam-policy-binding scheduler-events \
  --member="serviceAccount:scheduler-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=enlite-prod

# NÃO tem: roles/healthcare.* (matching usa dados anonimizados/ponteiros)


# ─────────────────────────────────────────────────────────
# 13. analytics-service
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create analytics-service-sa \
  --display-name="Analytics Service" \
  --project=enlite-prod-services

# BigQuery SOMENTE de-identified dataset
gcloud projects add-iam-policy-binding enlite-audit \
  --member="serviceAccount:analytics-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding enlite-audit \
  --member="serviceAccount:analytics-service-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# NÃO tem: roles/cloudsql.* (não acessa banco com PII)
# NÃO tem: roles/healthcare.* (não acessa FHIR com PHI)
# Acessa APENAS dados de-identified no BigQuery


# ─────────────────────────────────────────────────────────
# 14. backoffice-bff
# ─────────────────────────────────────────────────────────
gcloud iam service-accounts create backoffice-bff-sa \
  --display-name="Backoffice BFF" \
  --project=enlite-prod-services

gcloud projects add-iam-policy-binding enlite-prod \
  --member="serviceAccount:backoffice-bff-sa@enlite-prod-services.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# backoffice-bff NÃO acessa bancos diretamente
# Agrega dados chamando outros serviços via gRPC
# NÃO tem: roles/cloudsql.*, roles/healthcare.*, roles/storage.*
```

---

## 6.3 — Dockerfile Padrão com Hardening de Segurança

Cada microserviço utiliza um Dockerfile multi-stage com hardening de segurança. O template abaixo é o padrão para todos os serviços NestJS.

**Fundamentação regulatória:**

- **HIPAA NPRM (Dez/2024):** Propõe "deploying anti-malware protection" e "removing extraneous software from relevant electronic information systems" como requisitos técnicos obrigatórios. Containers com imagem mínima (distroless/alpine) atendem ao requisito de remoção de software desnecessário.
- **OCR Cybersecurity Newsletter (Jan/2026):** System hardening inclui configurar sistemas com security baselines padronizadas e remover componentes desnecessários.
- **HIPAA Security Rule — 45 CFR 164.310(d)(2)(iii):** Mecanismos de accountability para rastrear movimentação de hardware e mídia — análogo ao rastreamento de imagens de container.

```dockerfile
# ─────────────────────────────────────────────────────────
# Dockerfile padrão — EnLite NestJS Microservice
# Hardened conforme HIPAA Security Rule + NPRM 2024
# ─────────────────────────────────────────────────────────

# Stage 1: Build
FROM node:22-alpine AS builder

# Metadata para inventory de assets (HIPAA NPRM: technology asset inventory)
LABEL org.enlite.service="${SERVICE_NAME}" \
      org.enlite.compliance="hipaa,lgpd,gdpr" \
      org.enlite.data-classification="${DATA_CLASSIFICATION}" \
      org.enlite.maintainer="security@enlitehealth.com"

WORKDIR /app

# Copiar apenas manifests primeiro (cache de dependências)
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar source e compilar
COPY src/ ./src/
RUN npm run build

# Stage 2: Production (imagem mínima)
FROM node:22-alpine AS production

# Hardening: criar usuário não-root
# HIPAA 164.312(a): controle de acesso — processos rodam com menor privilégio
RUN addgroup -g 1001 -S enlite && \
    adduser -u 1001 -S enlite -G enlite

# Hardening: remover pacotes desnecessários
# HIPAA NPRM: "removing extraneous software"
RUN apk --no-cache add dumb-init && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

WORKDIR /app

# Copiar apenas artefatos de produção
COPY --from=builder --chown=enlite:enlite /app/node_modules ./node_modules
COPY --from=builder --chown=enlite:enlite /app/dist ./dist
COPY --from=builder --chown=enlite:enlite /app/package.json ./

# Hardening: filesystem read-only (exceto /tmp)
# Previne modificação do container em runtime
RUN chmod -R 555 /app && \
    mkdir -p /tmp && chown enlite:enlite /tmp

# Rodar como usuário não-root
USER enlite

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Não expor porta no Dockerfile (definida no Helm chart)
# Evita conflitos e permite configuração por ambiente

# dumb-init como PID 1 (graceful shutdown — importante para não perder eventos)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

### Dockerfile Específico: phi-service (Hardening Adicional)

O `phi-service` processa ePHI diretamente e requer controles adicionais.

```dockerfile
# ─────────────────────────────────────────────────────────
# Dockerfile — phi-service (PHI Handler)
# HARDENING ADICIONAL: Este serviço acessa ePHI diretamente
# ─────────────────────────────────────────────────────────

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --only=production && npm cache clean --force
COPY src/ ./src/
RUN npm run build

FROM gcr.io/distroless/nodejs22-debian12 AS production

# Distroless: sem shell, sem package manager, sem ferramentas de debug
# Superfície de ataque mínima para o serviço mais sensível
# HIPAA NPRM: "removing extraneous software" — distroless é o padrão máximo

LABEL org.enlite.service="phi-service" \
      org.enlite.compliance="hipaa,lgpd,gdpr" \
      org.enlite.data-classification="PHI" \
      org.enlite.phi-handler="true"

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Distroless roda como nonroot (uid 65534) por padrão
USER nonroot

EXPOSE 8080
CMD ["dist/main.js"]
```

### Dockerfile Específico: analytics-service (Python/FastAPI)

```dockerfile
# ─────────────────────────────────────────────────────────
# Dockerfile — analytics-service (Python/FastAPI)
# Acessa APENAS dados de-identified no BigQuery
# ─────────────────────────────────────────────────────────

FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim AS production

LABEL org.enlite.service="analytics-service" \
      org.enlite.compliance="hipaa,lgpd,gdpr" \
      org.enlite.data-classification="de-identified"

RUN groupadd -g 1001 enlite && \
    useradd -u 1001 -g enlite -m enlite && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder --chown=enlite:enlite /root/.local /home/enlite/.local
COPY --chown=enlite:enlite src/ ./src/
ENV PATH=/home/enlite/.local/bin:$PATH

USER enlite
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## 6.4 — Helm Charts: Segurança por Design

Cada microserviço é deployado via Helm chart com security contexts restritivos. Os charts implementam defense-in-depth desde o nível do container até o nível do cluster.

### 6.4.1 — Security Context Padrão (Todos os Serviços)

```yaml
# templates/_security-context.yaml — incluso em todo deployment
securityContext:
  # Pod-level
  runAsNonRoot: true                    # HIPAA 164.312(a): menor privilégio
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001
  seccompProfile:
    type: RuntimeDefault                # Bloqueia syscalls perigosas

containers:
  - name: {{ .Values.service.name }}
    securityContext:
      allowPrivilegeEscalation: false   # Impede escalação de privilégio
      readOnlyRootFilesystem: true      # Filesystem imutável em runtime
      capabilities:
        drop:
          - ALL                         # Remove TODAS as Linux capabilities
      runAsNonRoot: true
    resources:
      requests:
        cpu: {{ .Values.resources.requests.cpu }}
        memory: {{ .Values.resources.requests.memory }}
      limits:
        cpu: {{ .Values.resources.limits.cpu }}
        memory: {{ .Values.resources.limits.memory }}
    volumeMounts:
      - name: tmp
        mountPath: /tmp                 # Único diretório gravável

volumes:
  - name: tmp
    emptyDir:
      sizeLimit: 100Mi                  # Limita escrita em /tmp
```

### 6.4.2 — Helm Chart: phi-service (Exemplo Completo)

```yaml
# charts/phi-service/values.yaml
service:
  name: phi-service
  replicas: 2                           # Mínimo 2 para alta disponibilidade
  port: 8080
  
  # HIPAA NPRM: technology asset inventory
  labels:
    app.kubernetes.io/name: phi-service
    app.kubernetes.io/part-of: enlite-health
    enlite.health/data-classification: phi
    enlite.health/compliance: "hipaa,lgpd,gdpr"
    enlite.health/phi-handler: "true"

  # Annotations para Istio sidecar
  annotations:
    sidecar.istio.io/inject: "true"
    traffic.sidecar.istio.io/excludeOutboundPorts: ""
    # mTLS STRICT — nenhuma comunicação sem TLS mútuo
    security.istio.io/tlsMode: "istio"

image:
  repository: us-east1-docker.pkg.dev/enlite-prod/enlite-services/phi-service
  tag: "{{ .Chart.AppVersion }}"
  pullPolicy: IfNotPresent

# GCP Service Account (Workload Identity)
serviceAccount:
  create: true
  name: phi-service-ksa
  annotations:
    iam.gke.io/gcp-service-account: phi-service-sa@enlite-prod-services.iam.gserviceaccount.com

resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi

# Auto-scaling baseado em CPU/Memory
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilization: 70
  targetMemoryUtilization: 80

# Health checks (HIPAA: availability de ePHI)
probes:
  liveness:
    httpGet:
      path: /health/live
      port: 8080
    initialDelaySeconds: 15
    periodSeconds: 10
    failureThreshold: 3
  readiness:
    httpGet:
      path: /health/ready
      port: 8080
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 3
  startup:
    httpGet:
      path: /health/startup
      port: 8080
    failureThreshold: 30
    periodSeconds: 2

# Secrets via Secret Manager (montados como volumes)
secrets:
  - name: FHIR_STORE_URL
    secretManagerKey: projects/enlite-prod/secrets/fhir-store-url/versions/latest
  - name: KMS_KEY_NAME
    secretManagerKey: projects/enlite-shared-infra/secrets/healthcare-kms-key/versions/latest

# Environment variables (NÃO sensíveis)
env:
  NODE_ENV: production
  LOG_LEVEL: info
  PORT: "8080"
  SERVICE_NAME: phi-service
  # Habilitar audit logging em nível de aplicação
  AUDIT_LOGGING_ENABLED: "true"
  AUDIT_PHI_ACCESS: "true"             # Log OBRIGATÓRIO de todo acesso a PHI
  PUBSUB_TOPIC_PHI: phi-events

# Pod Disruption Budget (disponibilidade durante deploys)
pdb:
  minAvailable: 1
```

### 6.4.3 — Kubernetes Network Policies por Serviço

As Network Policies implementam segmentação de rede no nível do pod, complementando as firewall rules da VPC (Bloco 2 do documento v2).

```yaml
# ─────────────────────────────────────────────────────────
# NetworkPolicy: phi-service
# ISOLAMENTO MÁXIMO — apenas serviços autorizados podem comunicar
# HIPAA NPRM: "require network segmentation"
# HIPAA 164.312(a): access control técnico
# ─────────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: phi-service-netpol
  namespace: enlite-prod
  labels:
    enlite.health/compliance: "hipaa"
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: phi-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # APENAS estes serviços podem chamar o phi-service via gRPC
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: patient-service
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: provider-service
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: consent-service
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: backoffice-bff
      ports:
        - protocol: TCP
          port: 8080
    # Istio sidecar
    - from:
        - podSelector:
            matchLabels:
              app: istio-ingressgateway
      ports:
        - protocol: TCP
          port: 15090   # Istio metrics
  egress:
    # Cloud Healthcare API (via Private Service Connect)
    - to:
        - ipBlock:
            cidr: 10.0.4.0/24           # Subnet PHI
      ports:
        - protocol: TCP
          port: 443
    # Cloud Pub/Sub (eventos de auditoria)
    - to:
        - ipBlock:
            cidr: 199.36.153.8/30       # Private Google Access
      ports:
        - protocol: TCP
          port: 443
    # DNS
    - to: []
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53


# ─────────────────────────────────────────────────────────
# NetworkPolicy: auth-service
# ─────────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: auth-service-netpol
  namespace: enlite-prod
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: auth-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Acessível por TODOS os serviços (validação de JWT)
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: enlite-health
      ports:
        - protocol: TCP
          port: 8080
    # Istio ingress (requests externos)
    - from:
        - podSelector:
            matchLabels:
              app: istio-ingressgateway
      ports:
        - protocol: TCP
          port: 8080
  egress:
    # Identity Platform (autenticação)
    - to:
        - ipBlock:
            cidr: 199.36.153.8/30
      ports:
        - protocol: TCP
          port: 443
    # Cloud SQL (schema iam)
    - to:
        - ipBlock:
            cidr: 10.0.3.0/24           # Subnet data
      ports:
        - protocol: TCP
          port: 5432
    # DNS
    - to: []
      ports:
        - protocol: UDP
          port: 53


# ─────────────────────────────────────────────────────────
# NetworkPolicy: notification-service
# HIPAA: notification-service NUNCA recebe PHI
# ─────────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: notification-service-netpol
  namespace: enlite-prod
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: notification-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Apenas recebe de Pub/Sub (via pull)
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: enlite-health
      ports:
        - protocol: TCP
          port: 8080
  egress:
    # APIs externas: Twilio, SendGrid, Firebase Cloud Messaging
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
    # Redis (fila de mensagens)
    - to:
        - ipBlock:
            cidr: 10.0.3.0/24
      ports:
        - protocol: TCP
          port: 6379
    # DNS
    - to: []
      ports:
        - protocol: UDP
          port: 53
    # BLOQUEADO: acesso a Cloud SQL (não tem necessidade)
    # BLOQUEADO: acesso a Cloud Healthcare API (NUNCA processa PHI)


# ─────────────────────────────────────────────────────────
# NetworkPolicy: analytics-service
# Acessa APENAS BigQuery com dados de-identified
# ─────────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: analytics-service-netpol
  namespace: enlite-prod
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: analytics-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: backoffice-bff
      ports:
        - protocol: TCP
          port: 8080
  egress:
    # BigQuery (via Private Google Access)
    - to:
        - ipBlock:
            cidr: 199.36.153.8/30
      ports:
        - protocol: TCP
          port: 443
    # DNS
    - to: []
      ports:
        - protocol: UDP
          port: 53
    # BLOQUEADO: Cloud SQL (não acessa dados identificados)
    # BLOQUEADO: Cloud Healthcare API (não acessa PHI)
    # BLOQUEADO: Cloud Storage (não acessa mídia)
```

---

## 6.5 — Istio Service Mesh: mTLS e Authorization Policies

O Istio service mesh fornece três camadas de segurança adicionais:

1. **mTLS obrigatório** entre todos os serviços (HIPAA 164.312(e)(1): transmission security)
2. **Authorization policies** que restringem quais serviços podem chamar quais endpoints
3. **Observability** completa com tracing distribuído (HIPAA 164.312(b): audit controls)

```yaml
# ─────────────────────────────────────────────────────────
# PeerAuthentication: mTLS STRICT em todo o namespace
# HIPAA 164.312(e)(1): Transmission Security
# HIPAA NPRM: "require encryption of ePHI in transit"
# GDPR Art. 32(1)(a): encryption of personal data
# ─────────────────────────────────────────────────────────
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: enlite-prod
spec:
  mtls:
    mode: STRICT    # Rejeita TODA comunicação sem mTLS


# ─────────────────────────────────────────────────────────
# AuthorizationPolicy: phi-service
# SOMENTE serviços autorizados podem acessar o phi-service
# HIPAA 164.312(a): Access Control
# HIPAA 164.514(d): Minimum Necessary
# ─────────────────────────────────────────────────────────
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: phi-service-authz
  namespace: enlite-prod
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: phi-service
  action: ALLOW
  rules:
    # patient-service: pode criar e ler Patient/Condition
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/patient-service-ksa"
      to:
        - operation:
            methods: ["POST", "GET"]
            paths:
              - "/api/v1/fhir/patient*"
              - "/api/v1/fhir/condition*"
    # provider-service: pode ler Condition para matching
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/provider-service-ksa"
      to:
        - operation:
            methods: ["GET"]
            paths:
              - "/api/v1/fhir/condition*"
    # consent-service: pode gerenciar FHIR Consent
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/consent-service-ksa"
      to:
        - operation:
            methods: ["POST", "GET", "PUT"]
            paths:
              - "/api/v1/fhir/consent*"
    # backoffice-bff: pode ler (com filtro minimum necessary)
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/backoffice-bff-ksa"
      to:
        - operation:
            methods: ["GET"]
            paths:
              - "/api/v1/fhir/*"
    # Health checks (istio probes)
    - from: [{}]
      to:
        - operation:
            methods: ["GET"]
            paths: ["/health/*"]


# ─────────────────────────────────────────────────────────
# AuthorizationPolicy: permission-service
# SOMENTE backoffice-bff pode modificar permissões
# HIPAA 164.308(a)(4): Information Access Management
# ─────────────────────────────────────────────────────────
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: permission-service-authz
  namespace: enlite-prod
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: permission-service
  action: ALLOW
  rules:
    # backoffice-bff: ÚNICO que pode modificar permissões
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/backoffice-bff-ksa"
      to:
        - operation:
            methods: ["POST", "PUT", "DELETE", "GET"]
    # Todos os serviços: podem LER permissões (para enforcement)
    - from:
        - source:
            principals:
              - "cluster.local/ns/enlite-prod/sa/*"
      to:
        - operation:
            methods: ["GET"]
            paths:
              - "/api/v1/permissions/check*"
              - "/api/v1/permissions/resolve*"
    # Health checks
    - from: [{}]
      to:
        - operation:
            methods: ["GET"]
            paths: ["/health/*"]
```

---

## 6.6 — Database Roles: Isolamento no PostgreSQL

Além dos GCP Service Accounts, cada serviço possui um database role no PostgreSQL com permissões granulares. Isso cria uma segunda camada de isolamento — mesmo que um service account seja comprometido, o database role limita o que pode ser feito no banco.

```sql
-- ─────────────────────────────────────────────────────────
-- Database Roles por Microserviço
-- HIPAA 164.312(a): Access Control
-- HIPAA 164.308(a)(4): Information Access Management
-- LGPD Art. 6, III: Princípio da necessidade
-- ─────────────────────────────────────────────────────────

-- Role base (todos os serviços herdam)
CREATE ROLE app_service_base NOLOGIN;
GRANT USAGE ON SCHEMA iam TO app_service_base;
GRANT SELECT ON iam.permissions, iam.screen_permissions, 
  iam.component_permissions, iam.field_permissions, 
  iam.actions, iam.data_filters TO app_service_base;
-- NOTA: app_service_base pode LER permissões mas NÃO pode modificá-las

-- ─── auth-service ───
CREATE ROLE auth_service LOGIN;
GRANT app_service_base TO auth_service;
GRANT USAGE ON SCHEMA iam TO auth_service;
GRANT SELECT, INSERT, UPDATE ON iam.users, iam.tenants, iam.user_roles TO auth_service;
GRANT SELECT ON iam.roles TO auth_service;
-- NÃO tem acesso ao schema negocio
-- NÃO tem acesso ao schema compliance

-- ─── profile-service ───
CREATE ROLE profile_service LOGIN;
GRANT app_service_base TO profile_service;
GRANT USAGE ON SCHEMA negocio TO profile_service;
GRANT SELECT, INSERT, UPDATE ON negocio.profiles, negocio.user_context, 
  negocio.addresses TO profile_service;
-- NÃO tem DELETE em nenhuma tabela (soft-delete via is_active flag)

-- ─── patient-service ───
CREATE ROLE patient_service LOGIN;
GRANT app_service_base TO patient_service;
GRANT USAGE ON SCHEMA negocio TO patient_service;
GRANT SELECT, INSERT, UPDATE ON negocio.patient_onboardings, negocio.patient_proxies,
  negocio.scheduling_preferences, negocio.addresses TO patient_service;
-- NÃO tem acesso a tabelas de providers
-- NÃO tem acesso direto ao FHIR (usa ponteiro fhir_patient_id apenas)

-- ─── provider-service ───
CREATE ROLE provider_service LOGIN;
GRANT app_service_base TO provider_service;
GRANT USAGE ON SCHEMA negocio TO provider_service;
GRANT SELECT, INSERT, UPDATE ON negocio.providers, negocio.provider_coverage_areas,
  negocio.provider_availability, negocio.provider_quiz_responses TO provider_service;
-- NÃO tem acesso a tabelas de patients

-- ─── consent-service ───
CREATE ROLE consent_service LOGIN;
GRANT app_service_base TO consent_service;
GRANT USAGE ON SCHEMA compliance TO consent_service;
GRANT SELECT, INSERT, UPDATE ON compliance.consents TO consent_service;
-- APPEND-ONLY: pode inserir mas consentimentos revogados são marcados, não deletados

-- ─── payer-service ───
CREATE ROLE payer_service LOGIN;
GRANT app_service_base TO payer_service;
GRANT USAGE ON SCHEMA negocio TO payer_service;
GRANT SELECT, INSERT, UPDATE ON negocio.organizations, negocio.organization_members,
  negocio.insurance_plans, negocio.payer_provider_contracts, 
  negocio.platform_contracts, negocio.patient_eligibility TO payer_service;
-- BLOQUEADO: acesso a patient_onboardings, providers (minimum necessary)

-- ─── permission-service (role privilegiado) ───
CREATE ROLE permission_admin_service LOGIN;
GRANT USAGE ON SCHEMA iam TO permission_admin_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam TO permission_admin_service;
-- ÚNICO role com escrita no schema iam.permissions
-- Toda alteração é logada em compliance.permission_audit_log via trigger

-- ─── audit-service ───
CREATE ROLE audit_service LOGIN;
GRANT USAGE ON SCHEMA compliance TO audit_service;
GRANT INSERT ON compliance.access_logs, compliance.security_incidents TO audit_service;
GRANT SELECT ON compliance.access_logs, compliance.security_incidents,
  compliance.data_subject_requests, compliance.consents TO audit_service;
-- APPEND-ONLY: pode inserir mas NUNCA pode UPDATE ou DELETE logs
REVOKE UPDATE, DELETE ON compliance.access_logs FROM audit_service;
REVOKE UPDATE, DELETE ON compliance.security_incidents FROM audit_service;
-- Integridade forense dos logs: HIPAA 164.312(b)

-- ─── scheduler-service (READ-ONLY) ───
CREATE ROLE scheduler_service LOGIN;
GRANT app_service_base TO scheduler_service;
GRANT USAGE ON SCHEMA negocio TO scheduler_service;
GRANT SELECT ON negocio.providers, negocio.provider_coverage_areas,
  negocio.provider_availability, negocio.patient_onboardings,
  negocio.scheduling_preferences, negocio.addresses TO scheduler_service;
-- READ-ONLY: não pode inserir, atualizar ou deletar nada
-- Matching algoritmo opera sobre dados lidos

-- ─── analytics-service ───
-- NÃO tem database role no PostgreSQL
-- Acessa SOMENTE BigQuery com dados de-identified
-- Separação completa: não há conexão possível ao banco de produção
```

---

## 6.7 — Matriz de Compliance: Checklist de Verificação

A tabela abaixo mapeia cada controle implementado neste Bloco 6 ao requisito regulatório correspondente, com status de implementação.

| Requisito Regulatório | Referência | Controle Implementado | Status |
|---|---|---|---|
| Access Control | HIPAA 164.312(a)(1) | GCP SA por serviço + DB roles granulares | ✅ Definido |
| Unique User Identification | HIPAA 164.312(a)(2)(i) | Workload Identity (SA vinculado ao pod) | ✅ Definido |
| Emergency Access | HIPAA 164.312(a)(2)(ii) | Break-glass procedure (Bloco 8) | ⏳ Próxima iteração |
| Auto Logoff | HIPAA 164.312(a)(2)(iii) | Session timeout no JWT (Bloco 8) | ⏳ Próxima iteração |
| Encryption at Rest | HIPAA 164.312(a)(2)(iv) | CMEK via Cloud KMS + AES-256-GCM | ✅ Definido |
| Audit Controls | HIPAA 164.312(b) | pgAudit + Cloud Audit Logs + access_logs append-only | ✅ Definido |
| Integrity Controls | HIPAA 164.312(c)(1) | Read-only filesystem + append-only audit | ✅ Definido |
| Person/Entity Authentication | HIPAA 164.312(d) | mTLS via Istio + JWT validation | ✅ Definido |
| Transmission Security | HIPAA 164.312(e)(1) | TLS 1.3 + mTLS obrigatório | ✅ Definido |
| Network Segmentation | HIPAA NPRM | VPC subnets + K8s NetworkPolicy + Istio AuthzPolicy | ✅ Definido |
| Technology Asset Inventory | HIPAA NPRM | Container labels + Helm metadata | ✅ Definido |
| Remove Extraneous Software | HIPAA NPRM | Multi-stage builds + distroless (phi-service) | ✅ Definido |
| Anti-malware | HIPAA NPRM | Container scanning no CI/CD (Bloco 11) | ⏳ Próxima iteração |
| MFA | HIPAA NPRM | Identity Platform MFA (Bloco 8) | ⏳ Próxima iteração |
| Vulnerability Scanning | HIPAA NPRM | Trivy/Snyk no pipeline (Bloco 11) | ⏳ Próxima iteração |
| Penetration Testing | HIPAA NPRM | Anual (Bloco 13) | ⏳ Próxima iteração |
| 72h Restoration | HIPAA NPRM | Multi-AZ + auto-healing + runbooks | ✅ Definido |
| BAA Verification | HIPAA NPRM | compliance.entity_agreements + baa_signed check | ✅ Definido (Bloco 3) |
| Compliance Audit 12-meses | HIPAA NPRM | audit-service + BigQuery dashboards (Bloco 10/12) | ⏳ Próxima iteração |
| Menor Privilégio | LGPD Art. 6, III | SA isolation + DB role isolation | ✅ Definido |
| Segurança Técnica | LGPD Art. 46 | Todas as medidas acima combinadas | ✅ Definido |
| Privacy by Design | LGPD Guia 4.1.1 / GDPR Art. 25 | PHI isolado no FHIR + ponteiros opacos | ✅ Definido |
| Records of Processing | GDPR Art. 30 | Container labels + audit-service | ✅ Definido |
| Data Protection by Design | GDPR Art. 25 | Separation of concerns + encryption | ✅ Definido |
| Encryption | GDPR Art. 32(1)(a) | CMEK + mTLS + TLS 1.3 | ✅ Definido |
| Availability | GDPR Art. 32(1)(c) | HPA + PDB + multi-AZ | ✅ Definido |
| Segurança de Dados | Ley 25.326 Art. 9 | Todas as medidas técnicas acima | ✅ Definido |

---

## 6.8 — Diagrama de Comunicação Inter-Serviço (Network Map)

O diagrama abaixo documenta o fluxo de dados entre microserviços, atendendo ao requisito da HIPAA NPRM de manter um "network map that illustrates the movement of ePHI."

```
                            ┌─────────────────┐
                            │  Cloud Armor     │
                            │  (WAF/DDoS)      │
                            └────────┬─────────┘
                                     │ HTTPS/TLS 1.3
                            ┌────────▼─────────┐
                            │  API Gateway      │
                            │  (Rate Limit/JWT) │
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │ Istio Ingress GW  │
                            │ (mTLS termination)│
                            └────────┬─────────┘
                                     │ mTLS
        ┌────────────────────────────┼───────────────────────────────┐
        │                            │                               │
   ┌────▼────┐              ┌────────▼────────┐             ┌───────▼───────┐
   │  auth   │◄─────────────│ backoffice-bff  │─────────────►│ permission   │
   │ service │  JWT validate│ (agregador)     │ CRUD perms  │ service      │
   └─────────┘              └───┬──┬──┬──┬────┘             └──────────────┘
                                │  │  │  │
              ┌─────────────────┘  │  │  └──────────────────┐
              │                    │  │                      │
     ┌────────▼──────┐  ┌─────────▼──▼─────┐      ┌────────▼───────┐
     │ patient       │  │ provider         │      │ payer          │
     │ service       │  │ service          │      │ service        │
     └───────┬───────┘  └────────┬─────────┘      └────────────────┘
             │                   │
             │ gRPC (mTLS)       │ gRPC (mTLS)
             │                   │
     ┌───────▼───────────────────▼───────┐
     │        phi-service                │  ◄── ÚNICO com acesso FHIR
     │  (proxy Healthcare API)           │
     └───────────────┬───────────────────┘
                     │ Private Service Connect
                     │ (mTLS, porta 443)
     ┌───────────────▼───────────────────┐
     │   Cloud Healthcare API            │
     │   (FHIR R4 — ePHI)               │
     │   Subnet isolada: 10.0.4.0/24    │
     └───────────────────────────────────┘

    ─── Fluxos Assíncronos (Pub/Sub) ───

    patient.onboarded ──► phi-service, scheduler-service, audit-service
    provider.onboarded ─► scheduler-service, notification-service
    phi.accessed ───────► audit-service (OBRIGATÓRIO)
    phi.modified ───────► audit-service (OBRIGATÓRIO)
    consent.revoked ────► TODOS os serviços relevantes
    breach.detected ────► audit-service, notification-service
    data.deletion ──────► TODOS os serviços (LGPD/GDPR)
```

---

## 6.9 — Gaps Identificados e Dependências dos Próximos Blocos

Este Bloco 6 definiu a decomposição, containerização, orquestração, e isolamento de cada microserviço. Os seguintes itens dependem dos blocos subsequentes:

| Gap | Bloco Responsável | Impacto Regulatório |
|---|---|---|
| API Gateway configuration (routes, rate limits) | Bloco 7 | HIPAA 164.312(a): access control externo |
| gRPC proto definitions e circuit breakers | Bloco 7 | HIPAA: availability |
| MFA e emergency access procedures | Bloco 8 | HIPAA 164.312(a)(2)(ii-iii), HIPAA NPRM |
| Auto logoff e session management | Bloco 8 | HIPAA 164.312(a)(2)(iii) |
| Cloud Storage bucket policies e signed URLs | Bloco 9 | HIPAA 164.310(d) |
| pgAudit sink para BigQuery + alerting | Bloco 10 | HIPAA 164.312(b), HIPAA NPRM |
| CI/CD com vulnerability scanning | Bloco 11 | HIPAA NPRM: vuln scan 6 meses, pentest 12 meses |
| Compliance dashboards e audit viewer | Bloco 12 | HIPAA NPRM: compliance audit anual |
| Penetration testing e DR drill | Bloco 13 | HIPAA NPRM, HIPAA 164.308(a)(7) |

---

**NOTA SOBRE O HIPAA SECURITY RULE NPRM (Dez/2024):**

A proposta de fortalecimento da HIPAA Security Rule (NPRM publicada em 27/12/2024, conforme hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm) ainda não é lei final na data deste documento (Abril 2026). Entretanto, a arquitetura da EnLite foi projetada para ATENDER aos requisitos propostos, incluindo segmentação de rede obrigatória, criptografia universal, inventário de ativos, e restauração em 72 horas. Isso significa que quando a regra final for publicada, a EnLite já estará em conformidade, eliminando necessidade de refatoração.

**Recomendação:** O Security Official designado (Bloco 0.5) deve monitorar o status do NPRM em hhs.gov para confirmar a versão final dos requisitos e ajustar controles se necessário.

---

*EnLite Health Solutions — Bloco 6: Microserviços*  
*Jurisdições: LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)*  
*Fontes: hhs.gov/hipaa (Security Rule, NPRM, OCR Cybersecurity Newsletters), Guia LGPD Gov.BR, GDPR*  
*Abril 2026*
