# BLOCO 7 — COMUNICAÇÃO: API GATEWAY, gRPC INTER-SERVIÇO, PUB/SUB EVENTS, CIRCUIT BREAKERS

**EnLite Health Solutions — Arquitetura e Implementação**  
**Continuação do documento principal (Blocos 0-6)**  
**Jurisdições:** LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)

**Fontes de compliance consultadas nesta iteração:**
- HIPAA Security Rule — 45 CFR 164.312(e): Transmission Security
- HIPAA Security Rule — 45 CFR 164.308(a)(6): Security Incident Procedures
- HIPAA Security Rule — 45 CFR 164.308(a)(7): Contingency Plan
- HIPAA Breach Notification Rule — 45 CFR 164.404-410
- HIPAA NPRM (Dez/2024) — hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm
- OCR Cybersecurity Newsletter Oct/2022 — Security Incident Response
- OCR Cybersecurity Newsletter Jan/2026 — System Hardening
- HHS Guidance on HIPAA & Cloud Computing — hhs.gov
- LGPD: Lei 13.709/2018 — Arts. 46, 48, 50
- GDPR: Arts. 32, 33, 34
- Ley 25.326 (Argentina): Art. 9

---

## 7.0 — Princípios de Comunicação para Healthcare

Toda comunicação entre componentes da plataforma EnLite obedece a três princípios invioláveis:

**Princípio 1 — PHI nunca transita por canais não criptografados.** A HIPAA Security Rule (45 CFR 164.312(e)(1)) exige proteção de ePHI durante transmissão em redes eletrônicas. A HIPAA NPRM propõe tornar a criptografia em trânsito obrigatória sem exceções. Todo canal na EnLite usa TLS 1.3 ou mTLS.

**Princípio 2 — Todo evento de acesso a PHI é auditado de forma imutável.** A HIPAA Security Rule (45 CFR 164.312(b)) exige mecanismos que registrem e examinem atividade em sistemas com ePHI. Eventos Pub/Sub que envolvem PHI publicam automaticamente um evento de auditoria para o audit-service.

**Princípio 3 — Falha de um serviço não compromete a disponibilidade dos demais.** A HIPAA Security Rule (45 CFR 164.308(a)(7)) exige contingency plans. Circuit breakers, retries com backoff, dead-letter queues, e fallbacks garantem resiliência.

---

## 7.1 — API Gateway: Ponto Único de Entrada

O API Gateway é a interface entre o mundo externo (apps mobile, web, parceiros) e os microserviços internos. NENHUM microserviço é acessível diretamente pela internet — todo tráfego externo passa pelo gateway.

### 7.1.1 — Stack: Kong on GKE (ou Apigee)

A escolha entre Kong (self-hosted no GKE) e Apigee (managed) depende de custo e compliance. Kong oferece controle total sobre dados (ePHI nos headers nunca sai do cluster), enquanto Apigee é managed pelo Google (coberto pelo BAA do Google Cloud).

**Recomendação:** Kong on GKE para produção inicial (controle máximo de ePHI em trânsito). Avaliar migração para Apigee quando o volume justificar o custo.

### 7.1.2 — Configuração de Segurança do Gateway

```yaml
# ─────────────────────────────────────────────────────────
# Kong Gateway — Configuração de Segurança
# HIPAA 164.312(e)(1): Transmission Security
# HIPAA 164.312(a)(1): Access Control
# HIPAA NPRM: "require encryption of ePHI in transit"
# ─────────────────────────────────────────────────────────

# ─── TLS Termination ───
_format_version: "3.0"

services: []

# Plugin global: forçar HTTPS
plugins:
  - name: pre-function
    config:
      access:
        - |
          if kong.request.get_scheme() == "http" then
            return kong.response.exit(301, nil, {
              ["Location"] = "https://" .. kong.request.get_host() .. kong.request.get_path_with_query()
            })
          end

  # Rate Limiting por Consumidor (DDoS mitigation layer 7)
  # HIPAA 164.308(a)(7): Availability — prevenir negação de serviço
  - name: rate-limiting
    config:
      minute: 100             # 100 req/min por consumidor (usuário autenticado)
      policy: redis
      redis_host: memorystore-redis.enlite-prod.internal
      redis_port: 6379
      redis_ssl: true
      fault_tolerant: true    # Se Redis falhar, permite tráfego (availability > rate limit)
      hide_client_headers: false

  # Rate Limiting por Tenant
  - name: rate-limiting
    config:
      minute: 1000            # 1000 req/min por tenant
      policy: redis
      redis_host: memorystore-redis.enlite-prod.internal
      redis_port: 6379
      redis_ssl: true
      limit_by: header
      header_name: X-Tenant-Id

  # Request Size Limiting (prevenção de payload excessivo)
  - name: request-size-limiting
    config:
      allowed_payload_size: 10  # 10 MB max (documentos, mídia via media-service)

  # IP Restriction (bloqueio geográfico se necessário por jurisdição)
  - name: ip-restriction
    config:
      deny: []                # Populado dinamicamente por Cloud Armor
      status: 403
      message: "Access denied by security policy"

  # Correlation ID (rastreabilidade de requests — HIPAA audit trail)
  - name: correlation-id
    config:
      header_name: X-Request-Id
      generator: uuid#counter
      echo_downstream: true

  # Response Transformer: remover headers internos
  - name: response-transformer
    config:
      remove:
        headers:
          - X-Powered-By
          - Server
          - X-Kong-Upstream-Latency
          - X-Kong-Proxy-Latency

  # Security Headers (OWASP)
  - name: response-transformer
    config:
      add:
        headers:
          - "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload"
          - "X-Content-Type-Options: nosniff"
          - "X-Frame-Options: DENY"
          - "X-XSS-Protection: 1; mode=block"
          - "Content-Security-Policy: default-src 'self'"
          - "Referrer-Policy: strict-origin-when-cross-origin"
          - "Permissions-Policy: camera=(), microphone=(), geolocation=(self)"

  # Request logging para auditoria
  # HIPAA 164.312(b): Audit Controls
  - name: file-log
    config:
      path: /dev/stdout        # Capturado pelo Cloud Logging
      reopen: true
      custom_fields_by_lua:
        tenant_id: "return kong.request.get_header('X-Tenant-Id') or 'unknown'"
        user_id: "return kong.ctx.shared.authenticated_user_id or 'anonymous'"
        request_id: "return kong.request.get_header('X-Request-Id') or 'none'"
```

### 7.1.3 — Rotas do API Gateway

Cada rota mapeia um path público para um microserviço interno, com plugins de segurança específicos.

```yaml
# ─────────────────────────────────────────────────────────
# Rotas por Serviço
# HIPAA 164.514(d): Minimum Necessary — cada rota expõe
# apenas os endpoints necessários para o consumidor
# ─────────────────────────────────────────────────────────

services:

  # ─── Auth Service ───
  - name: auth-service
    url: http://auth-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: auth-routes
        paths:
          - /api/v1/auth
        strip_path: false
        protocols: ["https"]
    plugins:
      # Sem JWT validation (auth-service É quem emite JWTs)
      - name: rate-limiting
        config:
          minute: 30            # Rate limit mais restritivo para login (brute force)
          policy: redis
          redis_host: memorystore-redis.enlite-prod.internal
          redis_port: 6379
          redis_ssl: true

  # ─── Profile Service ───
  - name: profile-service
    url: http://profile-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: profile-routes
        paths:
          - /api/v1/profiles
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
          header_names: ["Authorization"]

  # ─── Patient Service ───
  - name: patient-service
    url: http://patient-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: patient-routes
        paths:
          - /api/v1/patients
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      # ACL: apenas roles patient, family_member, admin podem acessar
      - name: acl
        config:
          allow: ["patient", "family_member", "admin", "provider"]
          hide_groups_header: true

  # ─── Provider Service ───
  - name: provider-service
    url: http://provider-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: provider-routes
        paths:
          - /api/v1/providers
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      - name: acl
        config:
          allow: ["provider", "admin"]
          hide_groups_header: true

  # ─── PHI Service (ACESSO RESTRITO) ───
  # PHI-service NÃO é exposto diretamente pelo gateway
  # Acesso externo a dados clínicos é intermediado pelo patient-service
  # que chama phi-service internamente via gRPC
  # Isso implementa HIPAA 164.514(d): minimum necessary

  # ─── Consent Service ───
  - name: consent-service
    url: http://consent-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: consent-routes
        paths:
          - /api/v1/consents
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]

  # ─── Payer Service ───
  - name: payer-service
    url: http://payer-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: payer-routes
        paths:
          - /api/v1/payers
          - /api/v1/organizations
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      - name: acl
        config:
          allow: ["payer_admin", "payer_claims_analyst", "payer_medical_director", "admin"]
          hide_groups_header: true

  # ─── Media Service ───
  - name: media-service
    url: http://media-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: media-routes
        paths:
          - /api/v1/media
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      - name: request-size-limiting
        config:
          allowed_payload_size: 50  # 50 MB para uploads de mídia

  # ─── Scheduler Service ───
  - name: scheduler-service
    url: http://scheduler-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: scheduler-routes
        paths:
          - /api/v1/scheduling
          - /api/v1/matching
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]

  # ─── Backoffice BFF ───
  - name: backoffice-bff
    url: http://backoffice-bff.enlite-prod.svc.cluster.local:8080
    routes:
      - name: backoffice-routes
        paths:
          - /api/v1/backoffice
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      - name: acl
        config:
          allow: ["admin", "compliance_officer", "support"]
          hide_groups_header: true
      - name: rate-limiting
        config:
          minute: 500           # Backoffice precisa de mais requests (dashboards)
          policy: redis
          redis_host: memorystore-redis.enlite-prod.internal
          redis_port: 6379
          redis_ssl: true

  # ─── Analytics Service ───
  - name: analytics-service
    url: http://analytics-service.enlite-prod.svc.cluster.local:8080
    routes:
      - name: analytics-routes
        paths:
          - /api/v1/analytics
        strip_path: false
        protocols: ["https"]
    plugins:
      - name: jwt
        config:
          claims_to_verify: ["exp"]
      - name: acl
        config:
          allow: ["admin", "compliance_officer", "analytics_viewer"]
          hide_groups_header: true
```

### 7.1.4 — O que o API Gateway NÃO expõe

Três serviços NUNCA são acessíveis pelo gateway (comunicação exclusivamente interna):

| Serviço | Motivo da não-exposição | Como é acessado |
|---|---|---|
| `phi-service` | Contém ePHI — acesso externo direto violaria minimum necessary (HIPAA 164.514(d)) | Via gRPC interno do patient-service, provider-service, consent-service |
| `permission-service` | Modificação de permissões deve ser restrita ao backoffice-bff | Via gRPC interno do backoffice-bff |
| `audit-service` | Logs de auditoria não devem ser manipuláveis por clientes externos | Via Pub/Sub (async) + gRPC interno do backoffice-bff (read-only) |

---

## 7.2 — gRPC Inter-Serviço: Definições de Protocolo

A comunicação síncrona entre microserviços usa gRPC com Protocol Buffers. O gRPC oferece tipagem forte, streaming bidirecional, e performance superior ao REST para comunicação intra-cluster.

### 7.2.1 — Proto Definitions

```protobuf
// ─────────────────────────────────────────────────────────
// proto/phi_service.proto
// PHI Service — interface gRPC
// HIPAA 164.312(e): Transmission Security (mTLS via Istio)
// HIPAA 164.312(b): Audit Controls (toda chamada é logada)
// ─────────────────────────────────────────────────────────

syntax = "proto3";
package enlite.phi.v1;

option go_package = "enlite/phi/v1;phiv1";

// Contexto de auditoria — OBRIGATÓRIO em toda chamada
// HIPAA 164.312(b): "mechanisms that record and examine activity"
message AuditContext {
  string request_id = 1;         // Correlation ID propagado desde o gateway
  string actor_user_id = 2;      // Quem está fazendo a requisição
  string actor_role = 3;         // Role do ator (provider, admin, etc.)
  string tenant_id = 4;          // Tenant (determina jurisdição)
  string justification = 5;     // Motivo do acesso (obrigatório para PHI)
  string source_service = 6;    // Qual serviço originou a chamada
}

// ─── Patient FHIR Operations ───

message CreatePatientRequest {
  AuditContext audit = 1;
  string given_name = 2;
  string family_name = 3;
  string birth_date = 4;          // ISO 8601
  string identifier_system = 5;   // Ex: "https://cnpj.info/cpf"
  string identifier_value = 6;    // Valor criptografado (Cloud KMS)
  string tenant_id = 7;
}

message CreatePatientResponse {
  string fhir_patient_id = 1;    // Ponteiro opaco retornado ao caller
  bool created = 2;              // true = novo, false = já existia
}

message GetPatientRequest {
  AuditContext audit = 1;
  string fhir_patient_id = 2;
  repeated string fields = 3;    // Campos solicitados (minimum necessary)
}

message PatientData {
  string fhir_patient_id = 1;
  string given_name = 2;
  string family_name = 3;
  string birth_date = 4;
  // Diagnóstico NÃO é retornado aqui — é um recurso FHIR separado
}

// ─── Condition (Diagnóstico) ───

message CreateConditionRequest {
  AuditContext audit = 1;
  string fhir_patient_id = 2;
  string icd10_code = 3;         // Ex: "F41.1"
  string condition_text = 4;     // Descrição textual
  string clinical_status = 5;    // "active" | "resolved" | "remission"
}

message CreateConditionResponse {
  string fhir_condition_id = 1;
}

message GetConditionRequest {
  AuditContext audit = 1;
  string fhir_patient_id = 2;
  // Filtro: minimum necessary para o role do ator
  // Provider: vê tudo
  // Payer medical_director: vê ICD-10 code apenas
  // Payer claims_analyst: NÃO vê condições (bloqueado pelo permission-service)
}

message ConditionData {
  string fhir_condition_id = 1;
  string icd10_code = 2;
  string condition_text = 3;     // Vazio se ator não tem permissão
  string clinical_status = 4;
  string recorded_date = 5;
}

message ConditionListResponse {
  repeated ConditionData conditions = 1;
}

// ─── Consent (FHIR Consent) ───

message CreateConsentRequest {
  AuditContext audit = 1;
  string fhir_patient_id = 2;
  string consent_type = 3;       // "phi_processing" | "data_sharing" | etc.
  string scope = 4;              // Escopo do consentimento
  string jurisdiction = 5;       // "lgpd" | "hipaa" | "gdpr" | "ley25326"
}

message CreateConsentResponse {
  string fhir_consent_id = 1;
}

message RevokeConsentRequest {
  AuditContext audit = 1;
  string fhir_consent_id = 2;
  string revocation_reason = 3;
}

// ─── De-identification (para analytics) ───

message DeIdentifyRequest {
  AuditContext audit = 1;
  string fhir_patient_id = 2;
}

message DeIdentifiedData {
  string anonymized_id = 1;     // Hash irreversível
  string age_range = 2;         // "18-25", "26-35", etc.
  string region = 3;            // Estado/Região (sem cidade)
  string icd10_code = 4;        // Código mantido para analytics
  // NENHUM PII: sem nome, CPF, data de nascimento exata, endereço
}

// ─── Service Definition ───

service PhiService {
  // Patient operations
  rpc CreatePatient(CreatePatientRequest) returns (CreatePatientResponse);
  rpc GetPatient(GetPatientRequest) returns (PatientData);

  // Condition operations
  rpc CreateCondition(CreateConditionRequest) returns (CreateConditionResponse);
  rpc GetConditions(GetConditionRequest) returns (ConditionListResponse);

  // Consent operations
  rpc CreateConsent(CreateConsentRequest) returns (CreateConsentResponse);
  rpc RevokeConsent(RevokeConsentRequest) returns (CreateConsentResponse);

  // De-identification (para analytics-service)
  rpc DeIdentifyPatient(DeIdentifyRequest) returns (DeIdentifiedData);
}


// ─────────────────────────────────────────────────────────
// proto/permission_service.proto
// Permission Service — verificação de permissões
// HIPAA 164.308(a)(4): Information Access Management
// ─────────────────────────────────────────────────────────

syntax = "proto3";
package enlite.permission.v1;

message CheckPermissionRequest {
  string user_id = 1;
  string tenant_id = 2;
  string role = 3;
  string screen_key = 4;         // Tela sendo acessada
  string component_key = 5;      // Componente dentro da tela
  string field_key = 6;          // Campo específico
  string resource_id = 7;        // ID do registro (para ABAC)
}

message PermissionResult {
  bool allowed = 1;
  string access_level = 2;       // "hidden" | "mask_view" | "view" | "edit" | "full_view"
  string mask_pattern = 3;       // Se mask_view: "partial_end", "partial_start", etc.
  map<string, string> metadata = 4;
}

message ResolveScreenRequest {
  string user_id = 1;
  string tenant_id = 2;
  string role = 3;
  string screen_key = 4;
}

message ScreenPermissions {
  bool screen_allowed = 1;
  map<string, ComponentPermission> components = 2;
}

message ComponentPermission {
  bool visible = 1;
  map<string, FieldPermission> fields = 2;
}

message FieldPermission {
  string access_level = 1;
  string mask_pattern = 2;
}

service PermissionService {
  rpc CheckPermission(CheckPermissionRequest) returns (PermissionResult);
  rpc ResolveScreen(ResolveScreenRequest) returns (ScreenPermissions);
}


// ─────────────────────────────────────────────────────────
// proto/audit_service.proto
// Audit Service — registro de eventos de compliance
// HIPAA 164.312(b): Audit Controls
// ─────────────────────────────────────────────────────────

syntax = "proto3";
package enlite.audit.v1;

message LogAccessRequest {
  string actor_user_id = 1;
  string actor_role = 2;
  string resource_type = 3;      // "fhir_patient" | "fhir_condition" | "pii_cpf" | etc.
  string resource_id = 4;
  string action = 5;             // "read" | "create" | "update" | "delete" | "export"
  string justification = 6;
  string tenant_id = 7;
  string ip_address = 8;
  string service_name = 9;
  string request_id = 10;
}

message LogAccessResponse {
  string log_id = 1;
  bool success = 2;
}

message LogSecurityIncidentRequest {
  string incident_type = 1;      // "unauthorized_access" | "breach_attempt" | "anomaly"
  string severity = 2;           // "low" | "medium" | "high" | "critical"
  string description = 3;
  string source_service = 4;
  string source_ip = 5;
  string tenant_id = 6;
  string affected_user_id = 7;
  map<string, string> metadata = 8;
}

message LogSecurityIncidentResponse {
  string incident_id = 1;
  bool escalated = 2;            // true se severity >= high
}

service AuditService {
  rpc LogAccess(LogAccessRequest) returns (LogAccessResponse);
  rpc LogSecurityIncident(LogSecurityIncidentRequest) returns (LogSecurityIncidentResponse);
}


// ─────────────────────────────────────────────────────────
// proto/notification_service.proto
// Notification Service — envio de notificações
// NOTA: NUNCA recebe PHI nos payloads
// ─────────────────────────────────────────────────────────

syntax = "proto3";
package enlite.notification.v1;

message SendNotificationRequest {
  string recipient_user_id = 1;
  string tenant_id = 2;
  string channel = 3;           // "email" | "sms" | "push" | "whatsapp"
  string template_slug = 4;    // Identificador do template
  map<string, string> variables = 5;  // Variáveis do template (NUNCA PHI)
  string request_id = 6;
}

message SendNotificationResponse {
  string notification_id = 1;
  string status = 2;           // "queued" | "sent" | "failed"
}

service NotificationService {
  rpc SendNotification(SendNotificationRequest) returns (SendNotificationResponse);
}
```

### 7.2.2 — Interceptors gRPC: Auditoria e Propagação de Contexto

Todo microserviço NestJS implementa interceptors gRPC que garantem auditoria e propagação de contexto de segurança.

```typescript
// ─────────────────────────────────────────────────────────
// src/infrastructure/grpc/audit-interceptor.ts
// Interceptor que registra TODA chamada gRPC no audit-service
// HIPAA 164.312(b): Audit Controls
// ─────────────────────────────────────────────────────────

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { Metadata } from '@grpc/grpc-js';

@Injectable()
export class GrpcAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditClient: AuditServiceClient,
    private readonly serviceName: string,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const rpcContext = context.switchToRpc();
    const metadata: Metadata = rpcContext.getContext();
    const data = rpcContext.getData();

    const requestId = metadata.get('x-request-id')[0]?.toString() || 'unknown';
    const actorUserId = data?.audit?.actor_user_id || metadata.get('x-user-id')[0]?.toString();
    const actorRole = data?.audit?.actor_role || metadata.get('x-user-role')[0]?.toString();
    const tenantId = data?.audit?.tenant_id || metadata.get('x-tenant-id')[0]?.toString();
    const method = context.getHandler().name;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        // Log de acesso bem-sucedido
        this.auditClient.logAccess({
          actorUserId,
          actorRole,
          resourceType: this.inferResourceType(method),
          resourceId: this.inferResourceId(data),
          action: this.inferAction(method),
          justification: data?.audit?.justification || 'system',
          tenantId,
          ipAddress: metadata.get('x-forwarded-for')[0]?.toString() || '',
          serviceName: this.serviceName,
          requestId,
        });
      }),
      catchError((error) => {
        // Log de tentativa com falha (pode indicar incidente de segurança)
        this.auditClient.logAccess({
          actorUserId,
          actorRole,
          resourceType: this.inferResourceType(method),
          resourceId: this.inferResourceId(data) || 'unknown',
          action: `${this.inferAction(method)}_failed`,
          justification: `Error: ${error.message}`,
          tenantId,
          ipAddress: metadata.get('x-forwarded-for')[0]?.toString() || '',
          serviceName: this.serviceName,
          requestId,
        });
        throw error;
      }),
    );
  }

  private inferResourceType(method: string): string {
    if (method.includes('Patient')) return 'fhir_patient';
    if (method.includes('Condition')) return 'fhir_condition';
    if (method.includes('Consent')) return 'fhir_consent';
    if (method.includes('Permission')) return 'permission';
    return 'unknown';
  }

  private inferAction(method: string): string {
    if (method.startsWith('Create') || method.startsWith('create')) return 'create';
    if (method.startsWith('Get') || method.startsWith('get') || method.startsWith('Resolve')) return 'read';
    if (method.startsWith('Update') || method.startsWith('Revoke')) return 'update';
    if (method.startsWith('Delete')) return 'delete';
    if (method.startsWith('DeIdentify')) return 'de_identify';
    return 'unknown';
  }

  private inferResourceId(data: any): string {
    return data?.fhir_patient_id
      || data?.fhir_condition_id
      || data?.fhir_consent_id
      || data?.user_id
      || '';
  }
}
```

### 7.2.3 — Timeouts, Retries e Deadlines

```yaml
# ─────────────────────────────────────────────────────────
# Istio VirtualService: configuração de retries e timeouts
# HIPAA 164.308(a)(7): Contingency Plan — resiliência
# ─────────────────────────────────────────────────────────

# Serviços de alta criticidade (phi-service, auth-service)
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: phi-service-vs
  namespace: enlite-prod
spec:
  hosts:
    - phi-service
  http:
    - route:
        - destination:
            host: phi-service
            port:
              number: 8080
      timeout: 10s              # Timeout maior — FHIR operations podem ser lentas
      retries:
        attempts: 3
        perTryTimeout: 5s
        retryOn: "connect-failure,refused-stream,unavailable,cancelled,resource-exhausted"
        # NÃO retenta em deadline-exceeded (evita requests duplicados em operações de escrita)

---
# Serviços comuns
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: default-service-vs
  namespace: enlite-prod
spec:
  hosts:
    - profile-service
    - patient-service
    - provider-service
    - consent-service
    - payer-service
    - permission-service
    - scheduler-service
  http:
    - route:
        - destination:
            host: "{{ .host }}"
            port:
              number: 8080
      timeout: 5s
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: "connect-failure,refused-stream,unavailable"
```

---

## 7.3 — Circuit Breakers: Isolamento de Falhas

Circuit breakers impedem que a falha de um serviço cascade para outros. Se um serviço falha repetidamente, o circuit breaker "abre" e retorna erro imediatamente ao caller, permitindo que o serviço se recupere.

**Fundamentação regulatória:**

- **HIPAA 164.308(a)(7):** Contingency plan — o sistema deve manter disponibilidade de ePHI mesmo durante falhas parciais.
- **HIPAA NPRM (Dez/2024):** Propõe restauração de sistemas críticos em 72 horas. Circuit breakers reduzem o tempo de impacto de falhas.
- **GDPR Art. 32(1)(b):** Capacidade de assegurar a disponibilidade e resiliência permanentes dos sistemas de tratamento.

```yaml
# ─────────────────────────────────────────────────────────
# Istio DestinationRule: Circuit Breakers por Serviço
# ─────────────────────────────────────────────────────────

# phi-service (circuit breaker agressivo — proteger FHIR store)
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: phi-service-dr
  namespace: enlite-prod
spec:
  host: phi-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100           # Máximo de conexões simultâneas
        connectTimeout: 5s
      http:
        h2UpgradePolicy: DEFAULT
        maxRequestsPerConnection: 10
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 3         # 3 erros 5xx → ejetar pod
      interval: 10s                   # Verificar a cada 10s
      baseEjectionTime: 30s           # Pod ejetado por 30s
      maxEjectionPercent: 50          # No máximo 50% dos pods ejetados
      # Se > 50% ejetados, algo sistêmico está errado → alerta

---
# auth-service (circuit breaker moderado — serviço crítico)
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: auth-service-dr
  namespace: enlite-prod
spec:
  host: auth-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 200
        connectTimeout: 3s
      http:
        maxRequestsPerConnection: 20
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 15s
      maxEjectionPercent: 30

---
# Serviços comuns (circuit breaker padrão)
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: default-services-dr
  namespace: enlite-prod
spec:
  host: "*.enlite-prod.svc.cluster.local"
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 150
        connectTimeout: 3s
      http:
        maxRequestsPerConnection: 15
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 15s
      baseEjectionTime: 30s
      maxEjectionPercent: 40
```

---

## 7.4 — Pub/Sub: Eventos de Domínio Assíncronos

O Cloud Pub/Sub é usado para comunicação assíncrona entre serviços. Eventos de domínio são publicados quando algo significativo acontece, permitindo que múltiplos serviços reajam sem acoplamento.

### 7.4.1 — Catálogo Completo de Topics e Subscriptions

```yaml
# ─────────────────────────────────────────────────────────
# Terraform: Topics e Subscriptions Pub/Sub
# ─────────────────────────────────────────────────────────

# ─── Topics ───

resource "google_pubsub_topic" "user_events" {
  name    = "user-events"
  project = var.project_id

  # Mensagens criptografadas com CMEK
  # HIPAA 164.312(a)(2)(iv): Encryption
  kms_key_name = google_kms_crypto_key.pubsub_key.id

  # Retenção de mensagens por 7 dias (para replay em caso de falha)
  message_retention_duration = "604800s"

  labels = {
    compliance     = "hipaa-lgpd-gdpr"
    data_class     = "pii"
    service_owner  = "auth-service"
  }
}

resource "google_pubsub_topic" "patient_events" {
  name             = "patient-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "604800s"
  labels = { compliance = "hipaa-lgpd-gdpr", data_class = "phi-reference" }
}

resource "google_pubsub_topic" "provider_events" {
  name             = "provider-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "604800s"
  labels = { compliance = "hipaa-lgpd-gdpr", data_class = "pii-sensitive" }
}

resource "google_pubsub_topic" "phi_events" {
  name             = "phi-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "604800s"
  labels = {
    compliance   = "hipaa-lgpd-gdpr"
    data_class   = "phi-audit"
    # CRÍTICO: Este topic carrega referências a PHI
    # Mensagens contêm APENAS ponteiros (fhir_patient_id), NUNCA dados clínicos
    phi_handler  = "true"
  }
}

resource "google_pubsub_topic" "consent_events" {
  name             = "consent-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "604800s"
  labels = { compliance = "hipaa-lgpd-gdpr", data_class = "compliance" }
}

resource "google_pubsub_topic" "breach_events" {
  name             = "breach-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "2592000s"   # 30 dias (breach investigation)
  labels = {
    compliance   = "hipaa-lgpd-gdpr"
    data_class   = "security-incident"
    # Retenção estendida para investigação forense
    # HIPAA 164.308(a)(6): Security Incident Procedures
  }
}

resource "google_pubsub_topic" "data_deletion_events" {
  name             = "data-deletion-events"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "604800s"
  labels = {
    compliance   = "lgpd-gdpr"
    data_class   = "data-subject-rights"
    # LGPD Art. 18: Direitos do titular
    # GDPR Arts. 17, 20: Right to erasure, Right to data portability
  }
}


# ─── Dead Letter Topics (para mensagens que falharam) ───

resource "google_pubsub_topic" "dead_letter" {
  name             = "dead-letter"
  project          = var.project_id
  kms_key_name     = google_kms_crypto_key.pubsub_key.id
  message_retention_duration = "2592000s"   # 30 dias
  labels = { compliance = "hipaa-lgpd-gdpr", data_class = "error-recovery" }
}


# ─── Subscriptions ───

# audit-service subscreve a TODOS os topics relevantes
resource "google_pubsub_subscription" "audit_phi" {
  name    = "audit-phi-sub"
  topic   = google_pubsub_topic.phi_events.id
  project = var.project_id

  ack_deadline_seconds = 60

  # Dead letter após 5 tentativas
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  # Retry exponencial
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"   # 10 min máximo
  }

  # Filtro: apenas eventos PHI
  filter = "attributes.event_type = \"phi.accessed\" OR attributes.event_type = \"phi.modified\" OR attributes.event_type = \"phi.created\""

  labels = { compliance = "hipaa", subscriber = "audit-service" }
}

resource "google_pubsub_subscription" "audit_consent" {
  name    = "audit-consent-sub"
  topic   = google_pubsub_topic.consent_events.id
  project = var.project_id
  ack_deadline_seconds = 60
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
  retry_policy { minimum_backoff = "10s"; maximum_backoff = "600s" }
  labels = { compliance = "hipaa-lgpd-gdpr", subscriber = "audit-service" }
}

resource "google_pubsub_subscription" "audit_breach" {
  name    = "audit-breach-sub"
  topic   = google_pubsub_topic.breach_events.id
  project = var.project_id
  ack_deadline_seconds = 120    # Mais tempo para processar incidentes
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 10  # Mais tentativas para incidentes (crítico)
  }
  retry_policy { minimum_backoff = "5s"; maximum_backoff = "300s" }
  labels = { compliance = "hipaa-lgpd-gdpr", subscriber = "audit-service" }
}

# notification-service: notificações de breach e eventos gerais
resource "google_pubsub_subscription" "notification_breach" {
  name    = "notification-breach-sub"
  topic   = google_pubsub_topic.breach_events.id
  project = var.project_id
  ack_deadline_seconds = 60
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 10
  }
  labels = { compliance = "hipaa-lgpd-gdpr", subscriber = "notification-service" }
}

# data-deletion: TODOS os serviços que armazenam dados do titular
resource "google_pubsub_subscription" "deletion_patient" {
  name    = "deletion-patient-sub"
  topic   = google_pubsub_topic.data_deletion_events.id
  project = var.project_id
  ack_deadline_seconds = 300    # 5 min — deleção pode ser lenta
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
  labels = { compliance = "lgpd-gdpr", subscriber = "patient-service" }
}

resource "google_pubsub_subscription" "deletion_phi" {
  name    = "deletion-phi-sub"
  topic   = google_pubsub_topic.data_deletion_events.id
  project = var.project_id
  ack_deadline_seconds = 300
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
  labels = { compliance = "hipaa-lgpd-gdpr", subscriber = "phi-service" }
}

resource "google_pubsub_subscription" "deletion_media" {
  name    = "deletion-media-sub"
  topic   = google_pubsub_topic.data_deletion_events.id
  project = var.project_id
  ack_deadline_seconds = 300
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
  labels = { compliance = "lgpd-gdpr", subscriber = "media-service" }
}
```

### 7.4.2 — Schema de Mensagens Pub/Sub

Toda mensagem Pub/Sub segue um schema padronizado para rastreabilidade e compliance.

```typescript
// ─────────────────────────────────────────────────────────
// src/domain/events/DomainEvent.ts
// Schema base de eventos de domínio
// ─────────────────────────────────────────────────────────

interface DomainEventEnvelope<T = Record<string, unknown>> {
  // Metadata (presente em TODA mensagem)
  event_id: string;              // UUID único do evento
  event_type: string;            // Ex: "patient.onboarded", "phi.accessed"
  event_version: string;         // Versionamento: "1.0", "1.1"
  timestamp: string;             // ISO 8601 UTC
  source_service: string;        // Qual serviço publicou
  request_id: string;            // Correlation ID (rastreabilidade fim-a-fim)
  tenant_id: string;             // Tenant (jurisdição)
  actor_user_id: string;         // Quem causou o evento
  actor_role: string;            // Role do ator

  // Payload (específico por tipo de evento)
  payload: T;
}

// ─── Payloads específicos ───

// IMPORTANTE: Payloads de eventos NUNCA contêm dados PII/PHI diretamente.
// Contêm apenas ponteiros (IDs) que requerem lookup autenticado.
// Isso previne que mensagens em trânsito exponham dados sensíveis
// mesmo se o Pub/Sub for comprometido.

interface PatientOnboardedPayload {
  patient_onboarding_id: string;
  fhir_patient_id: string;      // Ponteiro opaco (NÃO é PHI)
  product_type: 'care' | 'clinic';
  registration_role: 'familiar' | 'paciente';
}

interface PhiAccessedPayload {
  fhir_resource_type: 'Patient' | 'Condition' | 'Consent';
  fhir_resource_id: string;
  action: 'read' | 'create' | 'update' | 'delete';
  justification: string;        // Motivo do acesso (obrigatório)
}

interface ConsentRevokedPayload {
  consent_id: string;
  fhir_consent_id: string;
  consent_type: string;
  jurisdiction: string;
  revocation_reason: string;
}

interface BreachDetectedPayload {
  incident_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  incident_type: string;
  affected_tenant_id: string;
  affected_user_count: number;
  description: string;
  detected_at: string;
  // HIPAA Breach Notification Rule: 45 CFR 164.404
  // Notificação sem atraso não-razoável, no máximo 60 dias
  notification_deadline: string;
  // GDPR Art. 33: Notificação à autoridade em 72 horas
  gdpr_72h_deadline: string;
}

interface DataDeletionRequestedPayload {
  data_subject_request_id: string;
  user_id: string;
  tenant_id: string;
  request_type: 'erasure' | 'portability';
  jurisdiction: string;
  deadline_at: string;
  // LGPD Art. 18: prazos
  // GDPR Art. 17: Right to erasure
  // Cada serviço que recebe este evento DEVE deletar/anonimizar
  // os dados do titular e confirmar a deleção
}
```

### 7.4.3 — Fluxo de Breach Detection e Notification

O fluxo mais crítico de comunicação é o de detecção e notificação de breaches. Este fluxo implementa requisitos de múltiplas jurisdições simultaneamente.

**Fundamentação regulatória:**

- **HIPAA Breach Notification Rule (45 CFR 164.404-410):** Notificação a indivíduos afetados "without unreasonable delay" e no máximo 60 dias após descoberta. Breaches afetando 500+ indivíduos requerem notificação ao OCR e à mídia.
- **HIPAA Security Rule (45 CFR 164.308(a)(6)):** Entidades reguladas devem identificar e responder a incidentes de segurança suspeitos ou conhecidos, mitigar efeitos nocivos, e documentar incidentes e seus resultados.
- **GDPR Art. 33:** Notificação à autoridade supervisora em no máximo 72 horas após tomada de conhecimento.
- **GDPR Art. 34:** Notificação aos titulares afetados "without undue delay" se o breach resultar em alto risco.
- **LGPD Art. 48:** Comunicação à ANPD e ao titular em prazo razoável.

```
┌──────────────────────────────────────────────────────────────────┐
│                   FLUXO DE BREACH DETECTION                      │
│                                                                  │
│  1. Qualquer serviço detecta anomalia:                          │
│     - auth-service: múltiplas tentativas de login falhadas      │
│     - phi-service: acesso a PHI fora do padrão                  │
│     - audit-service: padrão anômalo em logs                     │
│     - Cloud Armor: ataque detectado                             │
│                                                                  │
│  2. Serviço publica evento: breach.detected → Pub/Sub           │
│     Topic: breach-events (retenção: 30 dias, CMEK)              │
│                                                                  │
│  3. audit-service (subscriber):                                  │
│     a. Registra incidente em compliance.security_incidents       │
│     b. Calcula severidade e escopo                              │
│     c. Inicia workflow de investigação                          │
│     d. Se severity >= high:                                      │
│        - Calcula deadlines por jurisdição:                       │
│          · HIPAA: 60 dias (45 CFR 164.404)                      │
│          · GDPR: 72 horas (Art. 33)                             │
│          · LGPD: "prazo razoável" (Art. 48)                     │
│        - Escala para Security Official (Bloco 0.5)              │
│                                                                  │
│  4. notification-service (subscriber):                           │
│     a. Se severity >= high:                                      │
│        - Notifica Security Official por SMS + email + push      │
│        - Notifica equipe de resposta a incidentes               │
│     b. Se breach CONFIRMADO e escopo determinado:                │
│        - Gera notificações para titulares afetados              │
│        - Registra notificações em compliance.data_subject_requests │
│                                                                  │
│  5. NOTA: A criptografia de ePHI (CMEK + AES-256-GCM + mTLS)   │
│     pode qualificar a EnLite para a exceção de "unsecured PHI"  │
│     da Breach Notification Rule. Se PHI estiver criptografado    │
│     conforme guidance do HHS, notificação pode não ser           │
│     necessária. Isso deve ser avaliado caso a caso pelo          │
│     Security Official com assessoria jurídica.                   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4.4 — Fluxo de Data Deletion (Direito ao Esquecimento)

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE DATA DELETION (LGPD/GDPR)                  │
│                                                                  │
│  1. Titular solicita exclusão via app ou backoffice              │
│     → consent-service registra em compliance.data_subject_requests │
│     → Status: "pending"                                          │
│     → Deadline calculado por jurisdição:                         │
│       · LGPD: 15 dias (Art. 18)                                 │
│       · GDPR: 30 dias (Art. 12(3))                              │
│       · Ley 25.326: 10 dias corridos (Art. 14)                  │
│                                                                  │
│  2. consent-service publica: data.deletion.requested → Pub/Sub   │
│                                                                  │
│  3. Cada serviço subscriber processa a deleção:                  │
│                                                                  │
│     patient-service:                                             │
│       - Anonimiza dados em negocio.patient_onboardings           │
│       - Remove patient_proxies                                   │
│       - Remove scheduling_preferences                            │
│       - Publica confirmação: data.deletion.completed              │
│                                                                  │
│     phi-service:                                                 │
│       - Remove FHIR Patient resource                             │
│       - Remove FHIR Condition resources                          │
│       - Remove FHIR Consent resources                            │
│       - Publica confirmação: data.deletion.completed              │
│       - NOTA: Retenção legal pode exigir manter dados por        │
│         período adicional (HIPAA: 6 anos). Nesses casos,         │
│         dados são marcados como "retention_hold" e não deletados │
│         até o período expirar.                                    │
│                                                                  │
│     profile-service:                                             │
│       - Anonimiza dados em negocio.profiles                      │
│       - Remove endereços                                         │
│       - Publica confirmação                                      │
│                                                                  │
│     media-service:                                               │
│       - Remove fotos e documentos do GCS                         │
│       - Publica confirmação                                      │
│                                                                  │
│     provider-service (se titular for provider):                   │
│       - Anonimiza dados em negocio.providers                     │
│       - Remove documentos profissionais criptografados           │
│       - Publica confirmação                                      │
│                                                                  │
│  4. audit-service agrega confirmações:                           │
│     - Quando TODOS os serviços confirmaram → status: "completed"  │
│     - Se algum serviço falhou → status: "partial" + alerta       │
│     - Registra em compliance.data_subject_requests               │
│                                                                  │
│  5. NOTA: Logs de auditoria (compliance.access_logs) NÃO são     │
│     deletados mesmo quando o titular solicita. A LGPD Art. 16    │
│     e GDPR Art. 17(3)(e) permitem manutenção para exercício      │
│     regular de direitos e cumprimento de obrigação legal.         │
│     HIPAA exige retenção de 6 anos (45 CFR 164.316).             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7.5 — Segurança da Camada de Comunicação: Resumo

### 7.5.1 — Matriz de Criptografia em Trânsito

| Canal | Protocolo | Criptografia | Quem Gerencia | Requisito Regulatório |
|---|---|---|---|---|
| Mobile/Web → Cloud LB | HTTPS | TLS 1.3 | Certificate Manager (GCP) | HIPAA 164.312(e)(1) |
| Cloud LB → API Gateway | HTTPS | TLS 1.3 | Internal certificate | HIPAA 164.312(e)(1) |
| Gateway → Istio Ingress | HTTPS | TLS 1.3 | Istio CA | HIPAA 164.312(e)(1) |
| Serviço ↔ Serviço (gRPC) | gRPC+mTLS | TLS 1.3 mutual | Istio CA (auto-rotação) | HIPAA NPRM, GDPR 32 |
| Serviço → Cloud SQL | PostgreSQL+TLS | TLS 1.3 verify-full | Cloud SQL Proxy + IAM | HIPAA 164.312(e)(2) |
| Serviço → Healthcare API | HTTPS | TLS 1.3 | Google managed | HIPAA 164.312(e)(1) |
| Serviço → Pub/Sub | HTTPS | TLS 1.3 | Google managed | HIPAA 164.312(e)(1) |
| Serviço → Redis | TLS | TLS 1.2+ | Memorystore managed | HIPAA 164.312(e)(1) |
| Serviço → Cloud Storage | HTTPS | TLS 1.3 | Google managed | HIPAA 164.312(e)(1) |

**NENHUM canal usa comunicação não-criptografada.** Não há exceções.

### 7.5.2 — Dados que NUNCA transitam em mensagens Pub/Sub

| Dado | Motivo | O que transita no lugar |
|---|---|---|
| Nome do paciente | PII | `user_id` (UUID) |
| CPF/DNI/SSN | PII sensível | Nunca referenciado em eventos |
| Diagnóstico (texto) | PHI | `fhir_condition_id` (ponteiro opaco) |
| Notas clínicas | PHI | Nunca referenciado em eventos |
| Endereço completo | PII | Nunca referenciado em eventos |
| Número da carteirinha | PII | Nunca referenciado em eventos |
| Fotos/documentos | PII (mídia) | `media_id` (ponteiro) |

Se um evento Pub/Sub for interceptado, o atacante obtém APENAS UUIDs sem significado, ponteiros opacos para FHIR, e metadados operacionais. NENHUM dado pessoal ou de saúde é recuperável a partir das mensagens.

---

## 7.6 — Matriz de Compliance: Checklist do Bloco 7

| Requisito Regulatório | Referência | Controle Implementado | Status |
|---|---|---|---|
| Transmission Security | HIPAA 164.312(e)(1) | TLS 1.3 + mTLS em todos os canais | ✅ Definido |
| Encryption in Transit | HIPAA NPRM | Sem exceções — zero canais não-criptografados | ✅ Definido |
| Integrity Controls | HIPAA 164.312(c)(1) | gRPC proto validation + checksums | ✅ Definido |
| Access Control (Gateway) | HIPAA 164.312(a)(1) | JWT validation + ACL por role + rate limiting | ✅ Definido |
| Minimum Necessary | HIPAA 164.514(d) | phi-service não exposto no gateway; gRPC fields filtering | ✅ Definido |
| Audit Controls | HIPAA 164.312(b) | gRPC AuditInterceptor + Pub/Sub phi.accessed/modified events | ✅ Definido |
| Security Incident Procedures | HIPAA 164.308(a)(6) | breach.detected topic + audit-service workflow | ✅ Definido |
| Contingency Plan | HIPAA 164.308(a)(7) | Circuit breakers + retries + dead-letter queues + fallbacks | ✅ Definido |
| Breach Notification | HIPAA 164.404-410 | Workflow automatizado com deadlines por jurisdição | ✅ Definido |
| BA Incident Reporting | HIPAA 164.314(a)(2)(i)(C) | Pub/Sub breach event → audit-service → Security Official | ✅ Definido |
| 72h Notification GDPR | GDPR Art. 33 | Deadline calculado automaticamente no breach workflow | ✅ Definido |
| Right to Erasure | GDPR Art. 17 / LGPD Art. 18 | data.deletion.requested Pub/Sub → todos os serviços | ✅ Definido |
| Segurança Técnica | LGPD Art. 46 | Criptografia + rate limiting + WAF + circuit breakers | ✅ Definido |
| Comunicação de Incidente | LGPD Art. 48 | Integrado ao workflow de breach notification | ✅ Definido |

---

## 7.7 — Gaps e Dependências dos Próximos Blocos

| Gap | Bloco Responsável | Impacto |
|---|---|---|
| JWT structure, claims, e token lifecycle | Bloco 8 | Gateway JWT validation depende da definição de claims |
| MFA enforcement no gateway | Bloco 8 | HIPAA NPRM: MFA obrigatório |
| Cloud Armor WAF rules detalhadas | Bloco 8/13 | Proteção L7 no gateway |
| Alerting de circuit breaker open | Bloco 10 | Observability para degradação |
| Dead-letter monitoring e alerting | Bloco 10 | Mensagens perdidas = possível perda de audit trail |
| SAST/DAST scanning de proto files | Bloco 11 | Vulnerabilidades em definições de API |
| Breach notification UI no backoffice | Bloco 12 | Interface para Security Official gerenciar incidentes |
| Penetration testing da superfície de API | Bloco 13 | Validação de segurança do gateway |

---

*EnLite Health Solutions — Bloco 7: Comunicação*  
*Jurisdições: LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)*  
*Fontes: hhs.gov/hipaa (Security Rule, Breach Notification Rule, NPRM, OCR Newsletters), Guia LGPD Gov.BR, GDPR*  
*Abril 2026*
