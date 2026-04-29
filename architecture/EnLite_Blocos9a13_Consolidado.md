# BLOCOS 9-13 — CLOUD STORAGE, OBSERVABILITY, CI/CD, BACKOFFICE, HARDENING

**EnLite Health Solutions — Arquitetura e Implementação**  
**Continuação do documento principal (Blocos 0-8)**  
**Jurisdições:** LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)

**Fontes de compliance consultadas:**
- HIPAA Security Rule — 45 CFR 164.308-316 (todos os standards)
- HIPAA NPRM (Dez/2024) — hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm
- HIPAA Breach Notification Rule — 45 CFR 164.404-410
- HHS Disposal of PHI guidance — hhs.gov
- HHS Cloud Computing guidance — hhs.gov
- OCR Cybersecurity Newsletters (Jan/2026, Jun/2023, Oct/2022)
- NIST SP 800-88: Guidelines for Media Sanitization (referenciado pelo HHS)
- LGPD: Lei 13.709/2018
- GDPR: Arts. 5, 25, 28, 30, 32, 33, 35
- Ley 25.326: Arts. 2, 7, 9, 12

---
---

# BLOCO 9 — CLOUD STORAGE: BUCKETS, MEDIA SERVICE, SIGNED URLs, CDN

## 9.1 — Inventário de Buckets GCS

Cada bucket é classificado por tipo de dado, com criptografia e políticas de acesso diferenciadas.

```bash
# ─────────────────────────────────────────────────────────
# Buckets GCS — Configuração com CMEK
# HIPAA 164.310(d)(1): Device and Media Controls
# HIPAA 164.312(a)(2)(iv): Encryption
# ─────────────────────────────────────────────────────────

# 1. Fotos de perfil (providers e patients)
gsutil mb -p enlite-prod -l us-east1 -b on gs://enlite-profiles-prod
gsutil kms authorize -p enlite-prod -k projects/enlite-shared-infra/locations/us-east1/keyRings/enlite-keys/cryptoKeys/storage-key
gsutil kms encryption -k projects/enlite-shared-infra/locations/us-east1/keyRings/enlite-keys/cryptoKeys/storage-key gs://enlite-profiles-prod

# Uniform bucket-level access (sem ACLs granulares — IAM only)
gsutil uniformbucketlevelaccess set on gs://enlite-profiles-prod

# Versioning (proteção contra deleção acidental)
gsutil versioning set on gs://enlite-profiles-prod

# Lifecycle: mover para Nearline após 365 dias, deletar após retenção
gsutil lifecycle set lifecycle-profiles.json gs://enlite-profiles-prod

# Prevenção de acesso público (NUNCA público)
gsutil pap set enforced gs://enlite-profiles-prod


# 2. Documentos profissionais (certificados, licenças)
gsutil mb -p enlite-prod -l us-east1 -b on gs://enlite-documents-prod
gsutil kms encryption -k projects/enlite-shared-infra/locations/us-east1/keyRings/enlite-keys/cryptoKeys/storage-key gs://enlite-documents-prod
gsutil uniformbucketlevelaccess set on gs://enlite-documents-prod
gsutil versioning set on gs://enlite-documents-prod
gsutil pap set enforced gs://enlite-documents-prod
# Retention lock: documentos profissionais retidos por período regulatório
gsutil retention set 2190d gs://enlite-documents-prod  # 6 anos (HIPAA)


# 3. Uploads temporários (processamento antes de mover para bucket final)
gsutil mb -p enlite-prod -l us-east1 -b on gs://enlite-uploads-temp-prod
gsutil kms encryption -k projects/enlite-shared-infra/locations/us-east1/keyRings/enlite-keys/cryptoKeys/storage-key gs://enlite-uploads-temp-prod
# Lifecycle: deletar após 24 horas (temporário)
gsutil lifecycle set lifecycle-temp.json gs://enlite-uploads-temp-prod
gsutil pap set enforced gs://enlite-uploads-temp-prod


# 4. Backups de banco (disaster recovery)
gsutil mb -p enlite-data-prod -l us-east1 -b on gs://enlite-backups-prod
gsutil kms encryption -k projects/enlite-shared-infra/locations/us-east1/keyRings/enlite-keys/cryptoKeys/backup-key gs://enlite-backups-prod
gsutil retention set 2190d gs://enlite-backups-prod  # 6 anos
gsutil pap set enforced gs://enlite-backups-prod
# NINGUÉM além do backup job tem acesso
```

## 9.2 — Media Service: Signed URLs

O media-service gera signed URLs para upload e download. Isso significa que o frontend NUNCA acessa o GCS diretamente — toda operação é autenticada e auditada.

**Regras de segurança para signed URLs:**
- Expiração de upload URL: 15 minutos (tempo para completar upload)
- Expiração de download URL: 1 hora (visualização temporária)
- Toda geração de signed URL é logada no audit-service
- Content-Type validation no upload (apenas imagens e PDFs permitidos)
- Tamanho máximo: 50MB para documentos, 10MB para fotos
- Virus scanning via Cloud DLP ou ClamAV antes de mover para bucket final

```typescript
// src/application/use-cases/GenerateSignedUrlUseCase.ts
// HIPAA 164.312(a): Access Control — URLs são por usuário e temporárias

export class GenerateSignedUrlUseCase {
  private readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
  ]);

  async generateUploadUrl(params: {
    userId: string; tenantId: string; fileType: string;
    contentType: string; category: 'profile_photo' | 'document' | 'certificate';
  }): Promise<{ url: string; objectPath: string; expiresAt: string }> {
    if (!this.ALLOWED_MIME_TYPES.has(params.contentType)) {
      throw new Error(`Content type not allowed: ${params.contentType}`);
    }

    const bucket = params.category === 'profile_photo'
      ? 'enlite-profiles-prod' : 'enlite-documents-prod';
    const objectPath = `${params.category}/${params.userId}/${crypto.randomUUID()}.${params.fileType}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const [url] = await this.storage.bucket(bucket).file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: params.contentType,
      extensionHeaders: {
        'x-goog-content-length-range': '0,52428800', // Max 50MB
      },
    });

    // Audit: toda geração de URL é registrada
    await this.auditClient.logAccess({
      actorUserId: params.userId,
      actorRole: 'user',
      resourceType: 'media_upload_url',
      resourceId: objectPath,
      action: 'create',
      justification: `Upload ${params.category}`,
      tenantId: params.tenantId,
      serviceName: 'media-service',
      requestId: crypto.randomUUID(),
    });

    return { url, objectPath, expiresAt: expiresAt.toISOString() };
  }
}
```

## 9.3 — Disposal de Mídia (Data Deletion)

Conforme pesquisado em hhs.gov, a HIPAA Security Rule exige políticas para a disposição final de ePHI e remoção de ePHI de mídia eletrônica antes da reutilização (45 CFR 164.310(d)(2)(i-ii)).

```typescript
// Quando data.deletion.requested é recebido pelo media-service:
// 1. Listar todos os objetos do usuário em todos os buckets
// 2. Deletar cada objeto (com versioning, todas as versões)
// 3. Confirmar deleção via Pub/Sub
// NOTA: GCS com CMEK — quando a key é destroyed, dados são irrecuperáveis
```

## 9.4 — Compliance Checklist Bloco 9

| Requisito | Referência | Controle | Status |
|---|---|---|---|
| Device/Media Controls | HIPAA 164.310(d)(1) | CMEK + retention locks + lifecycle policies | ✅ |
| Disposal | HIPAA 164.310(d)(2)(i) | GCS object deletion + version cleanup | ✅ |
| Media Re-use | HIPAA 164.310(d)(2)(ii) | CMEK key destruction torna dados irrecuperáveis | ✅ |
| Encryption at Rest | HIPAA 164.312(a)(2)(iv) | CMEK via Cloud KMS em todos os buckets | ✅ |
| Access Control | HIPAA 164.312(a)(1) | Signed URLs temporárias + IAM per service account | ✅ |
| Audit | HIPAA 164.312(b) | Toda operação de signed URL logada | ✅ |
| Public Access Prevention | HIPAA 164.312(a) | PAP enforced em todos os buckets | ✅ |

---
---

# BLOCO 10 — OBSERVABILITY: CLOUD LOGGING, pgAUDIT, CLOUD TRACE, ALERTING, SLOs

## 10.1 — Arquitetura de Observability

```
┌─────────────────────────────────────────────────────────────┐
│                    FONTES DE LOGS                            │
│                                                             │
│  Cloud Audit Logs ──┐                                       │
│  (Healthcare API)   │                                       │
│                     ├──► Cloud Logging ──► BigQuery          │
│  pgAudit           ─┤     (centralizado)    (retenção 6yr)  │
│  (PostgreSQL)       │                                       │
│                     │                                       │
│  Application Logs ──┤    Cloud Trace ──► Trace Explorer      │
│  (stdout → Fluentd) │    (distributed tracing)              │
│                     │                                       │
│  VPC Flow Logs ────┤    Cloud Monitoring ──► Alerting        │
│  (network traffic)  │    (métricas + SLOs)    (PagerDuty)   │
│                     │                                       │
│  Istio Telemetry ──┘    Compliance ──► audit-service         │
│  (service mesh)          Dashboard     (BigQuery views)      │
└─────────────────────────────────────────────────────────────┘
```

## 10.2 — pgAudit: Configuração para Compliance

```sql
-- HIPAA 164.312(b): Audit Controls
-- Habilitar pgAudit em TODOS os schemas

-- No Cloud SQL, via flags:
-- cloudsql.enable_pgaudit = on
-- pgaudit.log = 'all'
-- pgaudit.log_catalog = off  (reduzir ruído)
-- pgaudit.log_parameter = on  (logar parâmetros de queries)
-- pgaudit.log_statement_once = on

-- Role-specific auditing (mais detalhado para roles sensíveis):
ALTER ROLE phi_service SET pgaudit.log = 'all';
ALTER ROLE permission_admin_service SET pgaudit.log = 'all';
ALTER ROLE audit_service SET pgaudit.log = 'write';

-- Object-level auditing para tabelas críticas:
ALTER TABLE compliance.access_logs SET (pgaudit.log = 'all');
ALTER TABLE compliance.security_incidents SET (pgaudit.log = 'all');
ALTER TABLE compliance.emergency_access_log SET (pgaudit.log = 'all');
ALTER TABLE iam.users SET (pgaudit.log = 'all');
```

## 10.3 — Sink para BigQuery (Retenção de 6 Anos)

```bash
# HIPAA 164.316(b)(2)(i): Retenção de documentação por 6 anos
# Logs do Cloud Logging retidos por 30 dias por padrão
# Sink para BigQuery garante retenção de 6 anos

gcloud logging sinks create enlite-audit-sink \
  bigquery.googleapis.com/projects/enlite-audit/datasets/audit_logs_6yr \
  --log-filter='resource.type="cloud_sql_database" OR resource.type="gke_cluster" OR resource.type="healthcare_dataset" OR resource.type="k8s_container"' \
  --project=enlite-prod

# Dataset BigQuery com retenção de 6 anos (2190 dias)
bq mk --dataset \
  --default_table_expiration=189216000 \
  --location=us-east1 \
  --description="HIPAA audit logs - 6 year retention" \
  enlite-audit:audit_logs_6yr
```

## 10.4 — Alerting Crítico

```yaml
# ─────────────────────────────────────────────────────────
# Alertas de segurança e compliance
# HIPAA 164.308(a)(1)(ii)(D): Information System Activity Review
# HIPAA 164.308(a)(6): Security Incident Procedures
# ─────────────────────────────────────────────────────────

# Alerta 1: Múltiplas falhas de autenticação (brute force)
- displayName: "Auth Failures > 10/min per IP"
  conditions:
    filter: 'resource.type="k8s_container" AND jsonPayload.status=401'
    threshold: 10
    duration: 60s
  notification: [pagerduty_security, email_security_officer]
  severity: HIGH

# Alerta 2: Circuit breaker aberto (degradação de serviço)
# Resolve gap do Bloco 7
- displayName: "Circuit Breaker Open - PHI Service"
  conditions:
    filter: 'resource.labels.service_name="phi-service" AND metric.type="istio.io/service/server/request_count" AND metric.labels.response_code="503"'
    threshold: 5
    duration: 60s
  notification: [pagerduty_oncall, slack_engineering]
  severity: CRITICAL

# Alerta 3: Dead-letter queue com mensagens (eventos perdidos)
# Resolve gap do Bloco 7
- displayName: "Dead Letter Queue Messages > 0"
  conditions:
    filter: 'resource.type="pubsub_subscription" AND resource.labels.subscription_id="dead-letter-sub"'
    metric: "pubsub.googleapis.com/subscription/num_undelivered_messages"
    threshold: 1
  notification: [pagerduty_oncall, email_security_officer]
  severity: HIGH
  # Mensagens no dead-letter podem significar perda de audit trail

# Alerta 4: Emergency access ativado
- displayName: "Emergency Access Activated"
  conditions:
    filter: 'jsonPayload.event_type="emergency_access.activated"'
    threshold: 1
  notification: [pagerduty_security, email_compliance_officer, sms_security_officer]
  severity: CRITICAL

# Alerta 5: Acesso a PHI fora do horário (anomaly detection)
- displayName: "PHI Access Outside Business Hours"
  conditions:
    filter: 'jsonPayload.event_type="phi.accessed" AND timestamp.hours NOT BETWEEN 6 AND 22'
    threshold: 3
    duration: 300s
  notification: [email_security_officer]
  severity: MEDIUM

# Alerta 6: Data deletion request pendente próximo do deadline
- displayName: "Data Deletion Request Near Deadline"
  conditions:
    query: 'SELECT COUNT(*) FROM compliance.data_subject_requests WHERE status="pending" AND deadline_at < NOW() + INTERVAL 48 HOURS'
    threshold: 1
  notification: [email_compliance_officer, slack_legal]
  severity: HIGH
```

## 10.5 — SLOs (Service Level Objectives)

| Serviço | SLO Disponibilidade | SLO Latência (p99) | Medição | Burn Rate Alert |
|---|---|---|---|---|
| auth-service | 99.9% | 500ms | Istio metrics | 5x burn → page |
| phi-service | 99.9% | 1000ms | Istio + FHIR latency | 3x burn → page |
| patient-service | 99.5% | 800ms | Istio metrics | 5x burn → page |
| API Gateway | 99.9% | 200ms | Kong metrics | 3x burn → page |
| Cloud SQL | 99.95% | N/A | GCP SLA + custom | 2x burn → page |

## 10.6 — Compliance Checklist Bloco 10

| Requisito | Referência | Controle | Status |
|---|---|---|---|
| Audit Controls | HIPAA 164.312(b) | pgAudit + Cloud Audit Logs + BigQuery sink | ✅ |
| Information System Activity Review | HIPAA 164.308(a)(1)(ii)(D) | BigQuery views + alerting | ✅ |
| Documentation Retention (6 years) | HIPAA 164.316(b)(2)(i) | BigQuery dataset 6yr retention | ✅ |
| Security Incident Detection | HIPAA 164.308(a)(6) | Alerting rules (brute force, anomalies) | ✅ |
| Contingency Monitoring | HIPAA 164.308(a)(7) | Circuit breaker + dead-letter alerts | ✅ |
| Dead-letter monitoring | Gap do Bloco 7 | Alerta quando DLQ > 0 mensagens | ✅ Resolvido |
| Circuit breaker alerting | Gap do Bloco 7 | Alerta quando CB abre em phi-service | ✅ Resolvido |

---
---

# BLOCO 11 — CI/CD: CLOUD BUILD, ARTIFACT REGISTRY, SECURITY SCANNING, DEPLOY PIPELINE

## 11.1 — Pipeline de CI/CD

```yaml
# ─────────────────────────────────────────────────────────
# cloudbuild.yaml — Pipeline de CI/CD
# HIPAA NPRM: vulnerability scanning a cada 6 meses
# HIPAA NPRM: "removing extraneous software"
# HIPAA NPRM: "deploying anti-malware protection"
# ─────────────────────────────────────────────────────────

steps:

  # ─── Stage 1: Lint + Type Check ───
  - name: 'node:22-alpine'
    id: lint
    entrypoint: sh
    args: ['-c', 'npm ci && npm run lint && npm run type-check']

  # ─── Stage 2: Unit Tests ───
  - name: 'node:22-alpine'
    id: test
    entrypoint: sh
    args: ['-c', 'npm run test -- --coverage --ci']

  # ─── Stage 3: Build Docker Image ───
  - name: 'gcr.io/cloud-builders/docker'
    id: build
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/enlite-services/${_SERVICE}:${SHORT_SHA}', '.']

  # ─── Stage 4: SAST (Static Application Security Testing) ───
  # HIPAA NPRM: vulnerability scanning obrigatório
  - name: 'returntocorp/semgrep'
    id: sast
    entrypoint: semgrep
    args: ['scan', '--config=auto', '--error', '--json', '-o', '/workspace/sast-report.json', 'src/']

  # ─── Stage 5: Container Vulnerability Scanning ───
  # HIPAA NPRM: anti-malware + remove extraneous software
  - name: 'aquasec/trivy:latest'
    id: container-scan
    args:
      - 'image'
      - '--exit-code=1'              # Falha no build se vulnerabilidade CRITICAL
      - '--severity=CRITICAL,HIGH'
      - '--ignore-unfixed'
      - '--format=json'
      - '--output=/workspace/trivy-report.json'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/enlite-services/${_SERVICE}:${SHORT_SHA}'

  # ─── Stage 6: Dependency Audit ───
  - name: 'node:22-alpine'
    id: audit
    entrypoint: sh
    args: ['-c', 'npm audit --production --audit-level=high']

  # ─── Stage 7: Push to Artifact Registry ───
  - name: 'gcr.io/cloud-builders/docker'
    id: push
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/enlite-services/${_SERVICE}:${SHORT_SHA}']

  # ─── Stage 8: Deploy to Staging ───
  - name: 'gcr.io/cloud-builders/gke-deploy'
    id: deploy-staging
    args:
      - 'run'
      - '--cluster=enlite-staging'
      - '--location=${_REGION}'
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/enlite-services/${_SERVICE}:${SHORT_SHA}'

  # ─── Stage 9: E2E Tests em Staging ───
  - name: 'node:22-alpine'
    id: e2e
    entrypoint: sh
    args: ['-c', 'npm run test:e2e -- --ci']
    env: ['API_URL=https://staging.enlitehealth.com']

  # ─── Stage 10: DAST (Dynamic Application Security Testing) ───
  # HIPAA NPRM: penetration testing anual + vulnerability scanning 6 meses
  - name: 'ghcr.io/zaproxy/zaproxy:stable'
    id: dast
    entrypoint: zap-api-scan.py
    args: ['-t', 'https://staging-api.enlitehealth.com/api/v1/openapi.json', '-f', 'openapi', '-r', '/workspace/dast-report.html']

  # ─── Stage 11: Deploy to Production (manual approval) ───
  # Requer aprovação manual no Cloud Build
  - name: 'gcr.io/cloud-builders/gke-deploy'
    id: deploy-prod
    args:
      - 'run'
      - '--cluster=enlite-prod'
      - '--location=${_REGION}'
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/enlite-services/${_SERVICE}:${SHORT_SHA}'
    waitFor: ['e2e', 'dast']

  # ─── Stage 12: Salvar relatórios de segurança ───
  - name: 'gcr.io/cloud-builders/gsutil'
    id: save-reports
    args: ['cp', '/workspace/*-report.*', 'gs://enlite-security-reports/${_SERVICE}/${SHORT_SHA}/']

options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'

substitutions:
  _SERVICE: 'auth-service'
  _REGION: 'us-east1'
```

## 11.2 — Artifact Registry: Scanning Contínuo

```bash
# Habilitar vulnerability scanning automático
gcloud artifacts repositories create enlite-services \
  --repository-format=docker \
  --location=us-east1 \
  --project=enlite-prod \
  --description="EnLite microservices container images"

# Container Analysis API (scanning automático de novas imagens)
gcloud services enable containeranalysis.googleapis.com --project=enlite-prod

# Artifact Registry Vulnerability Scanning
gcloud artifacts repositories update enlite-services \
  --location=us-east1 \
  --project=enlite-prod \
  --enable-vulnerability-scanning
```

## 11.3 — Supply Chain Security

```bash
# Binary Authorization: apenas imagens assinadas podem ser deployadas
gcloud container binauthz policy update \
  --project=enlite-prod \
  --policy-file=- <<EOF
{
  "defaultAdmissionRule": {
    "evaluationMode": "REQUIRE_ATTESTATION",
    "enforcementMode": "ENFORCED_BLOCK_AND_AUDIT_LOG",
    "requireAttestationsBy": [
      "projects/enlite-prod/attestors/cloud-build-attestor"
    ]
  }
}
EOF
```

## 11.4 — Compliance Checklist Bloco 11

| Requisito | Referência | Controle | Status |
|---|---|---|---|
| Vulnerability Scanning (6 meses) | HIPAA NPRM | Trivy no CI + Artifact Registry continuous scan | ✅ |
| Anti-malware | HIPAA NPRM | Container scanning + Binary Authorization | ✅ |
| Remove Extraneous Software | HIPAA NPRM | Multi-stage Docker builds (Bloco 6) + Trivy | ✅ |
| SAST | Best practice | Semgrep em todo PR | ✅ |
| DAST | HIPAA NPRM (pen test) | ZAP API scan em staging | ✅ |
| Supply Chain | HIPAA 164.308(a)(1) | Binary Authorization + signed images | ✅ |
| Security Reports Retention | HIPAA 164.316 | GCS bucket com 6yr retention | ✅ |
| Proto scanning | Gap do Bloco 7 | Semgrep cobre arquivos .proto | ✅ Resolvido |

---
---

# BLOCO 12 — BACKOFFICE: PERMISSION MANAGEMENT, COMPLIANCE DASHBOARDS, AUDIT VIEWER

## 12.1 — Módulos do Backoffice

O backoffice-bff agrega dados de todos os microserviços e expõe para o frontend administrativo. Ele NÃO acessa bancos diretamente (definido no Bloco 6).

```
┌────────────────────────────────────────────────────────────┐
│                  BACKOFFICE MODULES                         │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Permission      │  │ User            │                 │
│  │ Management      │  │ Management      │                 │
│  │                 │  │                 │                 │
│  │ RBAC+ABAC       │  │ Create/Edit/    │                 │
│  │ Screen/Comp/    │  │ Deactivate      │                 │
│  │ Field configs   │  │ Role changes    │                 │
│  │ Org overrides   │  │ MFA management  │                 │
│  └─────────────────┘  └─────────────────┘                 │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Compliance      │  │ Audit           │                 │
│  │ Center          │  │ Viewer          │                 │
│  │                 │  │                 │                 │
│  │ BAA tracking    │  │ Access logs     │                 │
│  │ RIPD/DPIA       │  │ PHI access      │                 │
│  │ Data subject    │  │ Security        │                 │
│  │ requests        │  │ incidents       │                 │
│  │ Consent status  │  │ Emergency access│                 │
│  │ Retention       │  │ reviews         │                 │
│  └─────────────────┘  └─────────────────┘                 │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Payer Network   │  │ Analytics       │                 │
│  │ Management      │  │ Dashboard       │                 │
│  │                 │  │                 │                 │
│  │ Organizations   │  │ ICHOM metrics   │                 │
│  │ Insurance plans │  │ Operational KPIs│                 │
│  │ Contracts       │  │ De-identified   │                 │
│  │ Eligibility     │  │ data only       │                 │
│  └─────────────────┘  └─────────────────┘                 │
└────────────────────────────────────────────────────────────┘
```

## 12.2 — Compliance Center: Funcionalidades Detalhadas

### 12.2.1 — BAA Tracker

```
Tela: /backoffice/compliance/baa
Dados de: compliance.entity_agreements + business.organizations

Funcionalidades:
- Lista de todas as organizações com status do BAA
- Alertas para BAAs próximos do vencimento (30 dias)
- Upload de documento BAA assinado (armazenado no GCS criptografado)
- Histórico de versões de cada BAA
- Bloqueio automático: organização sem BAA ativo → acesso a PHI bloqueado
  (compliance.platform_contracts.baa_signed = false → phi-service nega acesso)

HIPAA 164.308(b)(1): BAA obrigatório antes de qualquer acesso a ePHI
HIPAA NPRM: BA verification escrita a cada 12 meses
```

### 12.2.2 — Data Subject Requests (LGPD/GDPR)

```
Tela: /backoffice/compliance/data-requests
Dados de: compliance.data_subject_requests

Funcionalidades:
- Lista de todas as requisições com deadline e status
- Filtro por jurisdição (LGPD: 15 dias, GDPR: 30 dias, Ley 25.326: 10 dias)
- Alerta visual quando deadline < 48h (cor vermelha)
- Workflow: pending → in_progress → completed | denied
- Botão "Executar Deleção" → publica data.deletion.requested no Pub/Sub
- Tracking de confirmações de cada serviço (patient ✓, phi ✓, media ✓, etc.)
- Geração de relatório de conformidade para o titular

LGPD Art. 18: Direitos do titular
GDPR Arts. 15-22: Direitos do titular
```

### 12.2.3 — Emergency Access Review

```
Tela: /backoffice/compliance/emergency-access
Dados de: compliance.emergency_access_log
Resolve gap do Bloco 8

Funcionalidades:
- Lista de todos os emergency access com status de revisão
- Alerta para revisões pendentes (review_required_by < NOW())
- Visualização dos logs de atividade durante o emergency access
  (compliance.access_logs WHERE is_emergency_access = true)
- Formulário de revisão: justified | unjustified | escalated + notas
- Se "unjustified": gera incident report automaticamente

HIPAA 164.312(a)(2)(ii): Emergency Access Procedure
```

### 12.2.4 — Compliance Audit Dashboard (Anual)

```
Tela: /backoffice/compliance/audit
Resolve gap da HIPAA NPRM: compliance audit a cada 12 meses

Funcionalidades:
- Checklist interativo de todos os controles HIPAA/LGPD/GDPR
- Status: implemented | partially | not_implemented | not_applicable
- Evidência linkada para cada controle (documento, screenshot, log query)
- Risk matrix atualizada (probabilidade × impacto)
- Geração de relatório PDF para auditorias externas
- Histórico de auditorias anteriores

HIPAA NPRM: "compliance audit at least once every 12 months"
LGPD Art. 50: Boas práticas e governança
GDPR Art. 5(2): Accountability
```

## 12.3 — RBAC do Backoffice (Quem Vê o Quê)

| Módulo | admin | compliance_officer | security_officer | support |
|---|---|---|---|---|
| Permission Management | ✅ Full | ❌ | ❌ | ❌ |
| User Management | ✅ Full | 👁 View | ❌ | ✅ Edit (sem role change) |
| Compliance Center | ✅ Full | ✅ Full | 👁 View | ❌ |
| Audit Viewer | ✅ Full | ✅ Full | ✅ Full | 👁 View (sem PHI) |
| Emergency Access Review | 👁 View | ✅ Review | ✅ Activate | ❌ |
| Payer Network | ✅ Full | 👁 View | ❌ | ❌ |
| Analytics Dashboard | ✅ Full | ✅ Full | ❌ | 👁 View |

## 12.4 — Compliance Checklist Bloco 12

| Requisito | Referência | Controle | Status |
|---|---|---|---|
| Compliance Audit Anual | HIPAA NPRM | Audit dashboard + checklist + relatório | ✅ |
| BAA Management | HIPAA 164.308(b)(1) | BAA tracker + bloqueio automático | ✅ |
| Data Subject Rights | LGPD Art. 18 / GDPR 15-22 | Request management + deletion workflow | ✅ |
| Emergency Access Review | HIPAA 164.312(a)(2)(ii) | Review UI + audit trail | ✅ Resolvido |
| RIPD/DPIA | LGPD Art. 38 / GDPR Art. 35 | Template + tracking no Compliance Center | ✅ |
| Records of Processing | GDPR Art. 30 | Derivável do audit viewer + container metadata | ✅ |
| Breach notification UI | Gap do Bloco 7 | Incident management no Compliance Center | ✅ Resolvido |

---
---

# BLOCO 13 — HARDENING: PENETRATION TESTING, DISASTER RECOVERY, BREACH EXERCISE, GO-LIVE

## 13.1 — Penetration Testing

**Fundamentação:** HIPAA NPRM propõe "penetration testing at least once every 12 months." OCR Cybersecurity Newsletter (Jun/2023) documenta caso onde MFA impediu penetração de red team em sistemas sensíveis.

### 13.1.1 — Escopo do Pentest

| Área | Tipo | Frequência | Ferramenta/Método |
|---|---|---|---|
| API Gateway (superfície externa) | Black-box | Anual | Pentest externo (empresa especializada) |
| Microserviços (lateral movement) | Gray-box | Anual | Pentest interno + Istio authorization bypass attempts |
| FHIR Store (PHI) | White-box | Anual | Pentest + code review focado no phi-service |
| Backoffice (admin panel) | Black-box | Anual | Pentest focado em privilege escalation |
| Mobile App (React Native) | Black-box | Anual | Pentest mobile (token extraction, API abuse) |
| Cloud Infrastructure (GCP) | White-box | Anual | ScoutSuite + Prowler + manual review |
| Social Engineering | Red team | Anual | Phishing simulation para equipe |

### 13.1.2 — Remediation SLAs

| Severidade | Prazo de Correção | Comunicação |
|---|---|---|
| Critical | 24 horas | Security Officer + Compliance Officer + CTO |
| High | 7 dias | Security Officer + CTO |
| Medium | 30 dias | Engineering lead |
| Low | 90 dias | Sprint backlog |

## 13.2 — Disaster Recovery Drill

**Fundamentação:** HIPAA 164.308(a)(7) exige contingency plans incluindo backup, disaster recovery e emergency mode operation. HIPAA NPRM propõe restauração em 72 horas.

### 13.2.1 — Cenários de DR Drill (Anual)

```
CENÁRIO 1: Perda completa do Cloud SQL
  Ação: Restaurar do backup automático (PITR)
  RTO alvo: 2 horas
  RPO alvo: 5 minutos (WAL archiving)
  Verificação: Queries de integridade em todos os schemas
  Critério de sucesso: Todos os serviços operando com dados consistentes

CENÁRIO 2: Perda do GKE cluster
  Ação: Recriar cluster via Terraform + redeploy via Helm
  RTO alvo: 4 horas
  Verificação: Health checks de todos os serviços
  Critério de sucesso: API Gateway respondendo, PHI acessível

CENÁRIO 3: Perda do FHIR store (Cloud Healthcare API)
  Ação: Restaurar do BigQuery streaming export (dados de-identified) +
        backup FHIR (export periódico para GCS)
  RTO alvo: 8 horas
  Verificação: Queries de integridade nos recursos FHIR
  Critério de sucesso: Patient e Condition resources restaurados

CENÁRIO 4: Comprometimento de credenciais (key leak)
  Ação: Revogar keys → rotacionar secrets → redeploy
  RTO alvo: 1 hora
  Verificação: Nenhum acesso não-autorizado nos logs
  Critério de sucesso: Sistema operando com novas credenciais

CENÁRIO 5: Ransomware em workstation de dev
  Ação: Isolar workstation → verificar lateral movement →
        confirmar integridade de código (signed commits)
  RTO alvo: 2 horas (isolamento), 24h (verificação completa)
  Verificação: Binary Authorization confirma que imagens não foram adulteradas
```

### 13.2.2 — Documentação de DR Drill

Cada drill gera um relatório com: data/hora, participantes, cenário executado, RTO real vs alvo, RPO real vs alvo, problemas encontrados, ações corretivas, e assinatura do Security Official. Relatório armazenado em `compliance.security_incidents` com `incident_type = 'dr_drill'`.

## 13.3 — Breach Tabletop Exercise

**Fundamentação:** HIPAA Breach Notification Rule (45 CFR 164.404-410). OCR Cybersecurity Newsletter (Oct/2022) enfatiza que planos de resposta a incidentes bem pensados e testados são integrais para proteger ePHI.

### 13.3.1 — Cenário de Tabletop (Anual)

```
CENÁRIO: Exfiltração de dados de 2.000 pacientes

TIMELINE SIMULADA:

T+0h:   audit-service detecta padrão anômalo: 2.000 reads
        consecutivos de Patient resources do FHIR store por
        um provider comprometido. Alerta CRITICAL disparado.

T+0.5h: Security Officer recebe alerta. Ativa incident response.
        Revoga acesso do provider (RevokeUserAccessUseCase).
        Preserva evidência (logs em BigQuery — append-only).

T+1h:   Equipe de resposta analisa escopo:
        - Quais pacientes foram acessados? (access_logs)
        - Dados estavam criptografados? (sim — CMEK + mTLS)
        - Decryption key foi comprometida? (verificar KMS logs)

T+2h:   Classificação:
        - Se dados criptografados E key não comprometida:
          → Pode qualificar para exceção de "unsecured PHI"
          → Notificação pode NÃO ser necessária (consultar legal)
        - Se dados foram descriptografados pelo atacante:
          → Breach confirmado → iniciar notificação

T+4h:   Se breach confirmado, calcular deadlines:
        - HIPAA: 60 dias para notificar indivíduos e HHS
        - GDPR (se pacientes EU): 72 horas para DPA
        - LGPD (se pacientes BR): prazo razoável para ANPD
        - Ley 25.326 (se pacientes AR): boa prática 72h

T+24h:  Se GDPR: notificação à autoridade (72h deadline)
        Se ≥500 indivíduos em uma jurisdição US:
        → Notificar HHS OCR + mídia proeminente

T+48h:  Preparar notificação individualizada:
        - Descrição do que aconteceu
        - Tipos de dados afetados
        - O que a EnLite está fazendo
        - O que o paciente deve fazer
        - Telefone toll-free (ativo por 90 dias)

PARTICIPANTES: Security Officer, Compliance Officer, CTO,
               Legal counsel, DPO, representante de comunicação

RESULTADO: Relatório documentando decisões, tempos de resposta,
           gaps encontrados, e ações corretivas.
```

## 13.4 — Go-Live Checklist

```
═══════════════════════════════════════════════════════════════
          ENLITE HEALTH — GO-LIVE CHECKLIST
          Aprovação requerida do Security Official
═══════════════════════════════════════════════════════════════

LEGAL & COMPLIANCE
[ ] Parecer jurídico HIPAA (classificação Business Associate) — Bloco 0.1
[ ] Mapeamento LGPD (controlador/operador por fluxo) — Bloco 0.2
[ ] DPO nomeado e publicado — Bloco 0.5
[ ] Security Official designado — Bloco 0.5
[ ] RIPD/DPIA elaborado e aprovado — Bloco 0.3
[ ] BAA com Google Cloud assinado — Bloco 0.1
[ ] BAA com cada organização payer assinado — Bloco 3
[ ] Política de privacidade publicada (por jurisdição)
[ ] Termos de uso publicados (por jurisdição)
[ ] Registro na AAIP (Argentina) — Bloco 0.4

INFRAESTRUTURA (Blocos 2, 6)
[ ] VPC com 5 subnets configurada e testada
[ ] Cloud Armor WAF rules ativas
[ ] GKE cluster regional com auto-healing
[ ] Cloud SQL com HA, CMEK, backups 365 dias
[ ] Cloud Healthcare API FHIR store com CMEK
[ ] Istio service mesh com mTLS STRICT
[ ] Todos os 14 service accounts com least privilege

AUTENTICAÇÃO (Bloco 8)
[ ] Identity Platform configurado com MFA
[ ] MFA enforcement por role testado
[ ] Emergency access procedure testado
[ ] Auto logoff configurado e testado
[ ] Password policy aplicada
[ ] Session revocation testada

COMUNICAÇÃO (Bloco 7)
[ ] API Gateway com JWT validation + rate limiting
[ ] gRPC inter-serviço com mTLS
[ ] Pub/Sub topics com CMEK + dead-letter queues
[ ] Circuit breakers configurados e testados
[ ] Breach notification workflow testado (tabletop)

OBSERVABILITY (Bloco 10)
[ ] pgAudit habilitado em todos os schemas
[ ] Cloud Logging sink para BigQuery (6yr retention)
[ ] Todos os alertas CRITICAL configurados e testados
[ ] SLOs definidos e burn rate alerts ativos
[ ] Dashboards operacionais funcionando

CI/CD (Bloco 11)
[ ] SAST (Semgrep) no pipeline
[ ] Container scanning (Trivy) no pipeline
[ ] DAST (ZAP) em staging
[ ] Binary Authorization ativa
[ ] Artifact Registry com vulnerability scanning

BACKOFFICE (Bloco 12)
[ ] Permission management UI funcional
[ ] BAA tracker com alertas de vencimento
[ ] Data subject request workflow testado
[ ] Emergency access review UI funcional
[ ] Compliance audit checklist preenchido

HARDENING (Bloco 13)
[ ] Penetration testing executado e findings remediados
[ ] DR drill executado (todos os 5 cenários)
[ ] Breach tabletop exercise executado
[ ] Security awareness training completado pela equipe
[ ] Sanction policy documentada e comunicada

VALIDAÇÃO FINAL
[ ] Risk Analysis completo e assinado pelo Security Official
[ ] Todos os findings de CRITICAL/HIGH do pentest resolvidos
[ ] Zero vulnerabilidades CRITICAL nos containers em produção
[ ] Backup testado com restore completo
[ ] Runbooks documentados para cada serviço
[ ] Plano de rollback documentado e testado
[ ] Security Official assina aprovação de go-live

ASSINATURA:

Security Official: _________________________ Data: _________
CTO:               _________________________ Data: _________
DPO/Encarregado:   _________________________ Data: _________
```

## 13.5 — Compliance Checklist Final (Blocos 9-13 Consolidado)

| Requisito | Referência | Bloco | Status |
|---|---|---|---|
| Device/Media Controls | HIPAA 164.310(d) | 9 | ✅ |
| PHI Disposal | HIPAA 164.310(d)(2) | 9 | ✅ |
| Audit Controls (operacional) | HIPAA 164.312(b) | 10 | ✅ |
| Documentation Retention 6yr | HIPAA 164.316(b)(2) | 10 | ✅ |
| Vulnerability Scanning 6mo | HIPAA NPRM | 11 | ✅ |
| Penetration Testing 12mo | HIPAA NPRM | 13 | ✅ |
| Anti-malware | HIPAA NPRM | 11 | ✅ |
| Compliance Audit 12mo | HIPAA NPRM | 12 | ✅ |
| BA Verification 12mo | HIPAA NPRM | 12 | ✅ |
| Contingency Plan Testing | HIPAA 164.308(a)(7) | 13 | ✅ |
| Security Incident Procedures | HIPAA 164.308(a)(6) | 10, 13 | ✅ |
| Breach Notification Readiness | HIPAA 164.404-410 | 13 | ✅ |
| Emergency Access Review UI | Gap do Bloco 8 | 12 | ✅ Resolvido |
| Cloud Armor integration | Gap do Bloco 8 | 10 | ✅ Resolvido |
| Breach notification UI | Gap do Bloco 7 | 12 | ✅ Resolvido |
| Privacy by Design | LGPD Guia 4.1.1 / GDPR Art. 25 | Todos | ✅ |
| Accountability | LGPD Art. 6,X / GDPR Art. 5(2) | 10, 12 | ✅ |

---

## RESUMO: TODOS OS GAPS DOS BLOCOS ANTERIORES RESOLVIDOS

| Gap Original | Declarado no Bloco | Resolvido no Bloco | Como |
|---|---|---|---|
| Dead-letter monitoring | 7 | 10 | Alerta quando DLQ > 0 |
| Circuit breaker alerting | 7 | 10 | Alerta quando CB abre |
| Cloud Armor + auth failures | 8 | 10 | Alerta brute force > 10/min |
| Emergency access review UI | 8 | 12 | Tela dedicada no backoffice |
| Breach notification UI | 7 | 12 | Compliance Center |
| Proto/API scanning | 7 | 11 | Semgrep no CI |
| Penetration testing | 6, 7 | 13 | Anual, 7 áreas de escopo |
| Vulnerability scanning | 6 | 11 | Trivy no CI + Artifact Registry |
| Compliance audit anual | NPRM | 12 | Dashboard + checklist interativo |

---

*EnLite Health Solutions — Blocos 9 a 13*  
*Jurisdições: LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)*  
*Fontes: hhs.gov/hipaa (Security Rule, NPRM, Breach Notification, Disposal guidance, Cloud Computing guidance, OCR Newsletters), Guia LGPD Gov.BR, GDPR, NIST SP 800-88*  
*Abril 2026*
