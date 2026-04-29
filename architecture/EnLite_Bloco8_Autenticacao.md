# BLOCO 8 — AUTENTICAÇÃO: IDENTITY PLATFORM, JWT FLOW, MFA, EMERGENCY ACCESS, AUTO LOGOFF

**EnLite Health Solutions — Arquitetura e Implementação**  
**Continuação do documento principal (Blocos 0-7)**  
**Jurisdições:** LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)

**Fontes de compliance consultadas nesta iteração:**
- HIPAA Security Rule — 45 CFR 164.312(d): Person or Entity Authentication
- HIPAA Security Rule — 45 CFR 164.312(a)(2)(i): Unique User Identification
- HIPAA Security Rule — 45 CFR 164.312(a)(2)(ii): Emergency Access Procedure
- HIPAA Security Rule — 45 CFR 164.312(a)(2)(iii): Automatic Logoff
- HIPAA Security Rule — 45 CFR 164.312(a)(2)(iv): Encryption and Decryption
- HIPAA NPRM (Dez/2024) — "Require the use of multi-factor authentication, with limited exceptions"
- HIPAA NPRM (Dez/2024) — "Require notification within 24 hours when workforce member's access is changed or terminated"
- OCR Cybersecurity Newsletter Jun/2023 — Authentication best practices, MFA guidance
- HHS Technical Safeguards Paper (Security Series #4) — Automatic logoff specification
- LGPD: Lei 13.709/2018 — Arts. 46, 47
- GDPR: Arts. 5(1)(f), 32(1)(b-d)
- Ley 25.326: Art. 9

---

## 8.0 — Decisão Arquitetural: Google Cloud Identity Platform

A EnLite utiliza **Google Cloud Identity Platform** (não Firebase Authentication). Esta é uma decisão de compliance documentada no projeto desde o início.

**Por que Identity Platform e não Firebase Auth:**

O Identity Platform é o produto GCP enterprise com BAA (Business Associate Agreement) disponível. Firebase Authentication é uma camada consumer do mesmo serviço, mas sem BAA formal para HIPAA. Conforme pesquisado em hhs.gov, a guidance sobre HIPAA & Cloud Computing estabelece que quando uma entidade regulada usa um CSP para processar ePHI, é necessário um BAA com o CSP. O Identity Platform está coberto pelo BAA do Google Cloud.

**O que já existe no projeto (estado atual):**

O auth-service atual utiliza o Identity Platform com Email/Password e Google Sign-In como provedores. O backend valida tokens via Firebase Admin SDK (compatível com Identity Platform). O fluxo atual é: frontend chama Identity Platform REST API → recebe idToken (JWT) → envia no header Authorization: Bearer → backend valida com `admin.auth().verifyIdToken()`. O `MultiAuthService` suporta múltiplas estratégias de autenticação (Google ID Token, API Key, Internal Token).

**O que este bloco adiciona:** MFA obrigatório para roles críticos, custom claims estruturados, emergency access procedure, automatic logoff com tempos diferenciados, e session management com revogação.

---

## 8.1 — JWT Claims: Estrutura Padronizada

Todo JWT emitido pelo Identity Platform carrega custom claims que determinam o que o usuário pode fazer. Esses claims são a base do sistema de controle de acesso em todos os microserviços.

### 8.1.1 — Custom Claims Schema

```typescript
// ─────────────────────────────────────────────────────────
// src/domain/entities/JwtClaims.ts
// Estrutura de custom claims do Identity Platform
// HIPAA 164.312(a)(2)(i): Unique User Identification
// ─────────────────────────────────────────────────────────

interface EnLiteCustomClaims {
  // ─── Identificação Única (HIPAA 164.312(a)(2)(i)) ───
  enlite_user_id: string;        // UUID interno do iam.users
  tenant_id: string;             // UUID do tenant (determina jurisdição)
  region: 'br' | 'us' | 'eu' | 'ar';  // Região do tenant → lei aplicável

  // ─── Autorização ───
  role: string;                  // Role principal: 'patient' | 'family_member' |
                                 //   'provider' | 'admin' | 'manager' |
                                 //   'compliance_officer' | 'security_officer' |
                                 //   'support' | 'recruiter' | 'community_manager'

  org_roles?: OrgRole[];         // Roles em organizações (payers, clínicas)
  // Ex: [{ org_id: "uuid", role: "payer_claims_analyst" }]

  // ─── Segurança ───
  mfa_verified: boolean;         // true se MFA foi completado nesta sessão
  mfa_method?: 'totp' | 'sms' | 'security_key';
  is_emergency_access: boolean;  // true = break-glass ativo
  emergency_expires_at?: string; // ISO 8601 — quando o emergency access expira

  // ─── Metadata ───
  claims_version: number;        // Versionamento para migrations
  last_permission_sync: string;  // ISO 8601 — quando permissões foram sincronizadas
}

interface OrgRole {
  org_id: string;
  role: string;                  // 'payer_admin' | 'payer_claims_analyst' |
                                 //   'payer_medical_director' | 'clinic_admin' |
                                 //   'clinic_staff'
}
```

### 8.1.2 — Sincronização de Claims

Custom claims são sincronizados pelo auth-service quando:
1. Usuário faz login pela primeira vez (auto-provisioning)
2. Admin altera role do usuário via backoffice
3. Usuário é adicionado/removido de uma organização
4. MFA é habilitado ou verificado
5. Emergency access é ativado/desativado

```typescript
// ─────────────────────────────────────────────────────────
// src/application/use-cases/SyncCustomClaimsUseCase.ts
// Sincroniza custom claims do Identity Platform com o banco
// HIPAA NPRM: "notification within 24 hours when access is changed"
// ─────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

export class SyncCustomClaimsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly orgMemberRepository: IOrgMemberRepository,
    private readonly auditClient: AuditServiceClient,
  ) {}

  async execute(firebaseUid: string, reason: string): Promise<void> {
    // 1. Buscar dados atuais do usuário no banco
    const user = await this.userRepository.findByFirebaseUid(firebaseUid);
    if (!user) throw new Error(`User not found: ${firebaseUid}`);

    // 2. Buscar org_roles (se houver)
    const orgRoles = await this.orgMemberRepository.findByUserId(user.id);

    // 3. Montar custom claims
    const claims: EnLiteCustomClaims = {
      enlite_user_id: user.id,
      tenant_id: user.tenant_id,
      region: user.region,
      role: user.role,
      org_roles: orgRoles.map(m => ({
        org_id: m.organization_id,
        role: m.org_role,
      })),
      mfa_verified: false,         // Reset — próximo login requer MFA
      is_emergency_access: false,
      claims_version: 2,
      last_permission_sync: new Date().toISOString(),
    };

    // 4. Atualizar no Identity Platform
    await admin.auth().setCustomUserClaims(firebaseUid, claims);

    // 5. Revogar todos os tokens existentes (força re-login)
    // HIPAA NPRM: acesso alterado → notificação em 24h
    // Revogar tokens = enforcement imediato (melhor que 24h)
    await admin.auth().revokeRefreshTokens(firebaseUid);

    // 6. Audit log
    await this.auditClient.logAccess({
      actorUserId: 'system',
      actorRole: 'auth-service',
      resourceType: 'user_claims',
      resourceId: user.id,
      action: 'update',
      justification: reason,
      tenantId: user.tenant_id,
      ipAddress: '',
      serviceName: 'auth-service',
      requestId: crypto.randomUUID(),
    });
  }
}
```

---

## 8.2 — Fluxo de Autenticação Completo

### 8.2.1 — Login com Email/Senha

```
┌──────────────────────────────────────────────────────────────────┐
│                 FLUXO: LOGIN EMAIL/SENHA                         │
│                                                                  │
│  1. Frontend (React):                                            │
│     POST identitytoolkit.googleapis.com/v1/accounts:signInWithPassword │
│     Body: { email, password, returnSecureToken: true }           │
│     → Recebe: { idToken, refreshToken, expiresIn: 3600 }        │
│                                                                  │
│  2. Frontend verifica se MFA é necessário:                       │
│     Decodifica idToken → lê custom claims                        │
│     Se role ∈ {admin, manager, compliance_officer,               │
│       security_officer, payer_*} → MFA OBRIGATÓRIO               │
│     Se mfa_verified = false → redireciona para tela de MFA      │
│                                                                  │
│  3. MFA Challenge (se necessário):                               │
│     POST identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start │
│     → Recebe challenge com mfaPendingCredential                  │
│     Usuário insere código TOTP ou recebe SMS                     │
│     POST .../mfaSignIn:finalize                                  │
│     → Recebe novo idToken com mfa_verified = true                │
│                                                                  │
│  4. Frontend envia requests autenticados:                        │
│     Authorization: Bearer <idToken>                              │
│     → API Gateway valida JWT (Kong JWT plugin)                   │
│     → Kong extrai claims e propaga via headers:                  │
│       X-User-Id, X-Tenant-Id, X-User-Role, X-MFA-Verified       │
│                                                                  │
│  5. Microserviço receptor:                                       │
│     a. Valida que token não foi revogado                         │
│     b. Verifica MFA se rota requer PHI                           │
│     c. Consulta permission-service para RBAC+ABAC                │
│     d. Executa operação                                          │
│     e. Publica audit event                                       │
│                                                                  │
│  6. Token Refresh (a cada ~55 min, antes de expirar):            │
│     POST securetoken.googleapis.com/v1/token                     │
│     Body: { grant_type: "refresh_token", refresh_token: "..." }  │
│     → Recebe novo idToken (claims atualizados)                   │
│                                                                  │
│  NOTA: Se claims foram alterados (ex: role mudou),               │
│  o refresh retorna token com novos claims.                       │
│  Se refresh token foi revogado, retorna 401 → force login.       │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2.2 — Login com Google (OAuth)

```
┌──────────────────────────────────────────────────────────────────┐
│                 FLUXO: LOGIN COM GOOGLE                          │
│                                                                  │
│  1. Frontend abre popup do Google Sign-In                        │
│     → Google retorna credential (ID token do Google)             │
│                                                                  │
│  2. Frontend envia credential ao Identity Platform:              │
│     POST .../accounts:signInWithIdp                              │
│     Body: { postBody: "id_token=...&providerId=google.com" }     │
│     → Recebe idToken do Identity Platform + refreshToken         │
│                                                                  │
│  3. Frontend verifica se é primeiro login:                       │
│     GET /api/v1/auth/profile (com idToken)                       │
│     → Se 404: auto-provisioning (cria registro em iam.users)     │
│     → Se 200: login normal                                       │
│                                                                  │
│  4. Auto-provisioning (primeiro login):                          │
│     auth-service.GetOrCreateProfile:                             │
│       a. Verifica email domain para auto-role                    │
│         → @enlite.health → role: 'recruiter'                     │
│         → outros → role: 'worker' (padrão para providers)        │
│       b. Cria registro em iam.users                              │
│       c. Sincroniza custom claims                                │
│       d. Retorna perfil                                          │
│                                                                  │
│  5. MFA + autorização: mesmo fluxo do email/senha (passos 2-6)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8.3 — Multi-Factor Authentication (MFA)

### 8.3.1 — Fundamentação Regulatória

A MFA é o controle mais importante para prevenir acesso não autorizado a ePHI.

**HIPAA Security Rule — 45 CFR 164.312(d):** Exige que entidades reguladas implementem procedimentos para verificar que uma pessoa ou entidade buscando acesso a ePHI é quem alega ser.

**HIPAA NPRM (Dez/2024):** Propõe exigir MFA como requisito obrigatório, com exceções limitadas. Conforme publicado em hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm, a proposta inclui "require the use of multi-factor authentication, with limited exceptions."

**OCR Cybersecurity Newsletter (Jun/2023):** Conforme publicado em hhs.gov, o OCR reconhece que a risk analysis da entidade regulada deve orientar a seleção de soluções de autenticação, e que acessos remotos a sistemas com ePHI podem apresentar riscos maiores, exigindo autenticação mais forte como MFA. O OCR recomenda implementação de MFA, incluindo MFA resistente a phishing, onde apropriado para proteger ePHI.

**LGPD Art. 46:** Medidas técnicas de segurança.  
**GDPR Art. 32(1)(b):** Capacidade de assegurar a confidencialidade e integridade dos sistemas.

### 8.3.2 — Política de MFA por Role e Contexto

| Contexto | MFA Obrigatório? | Método | Justificativa |
|---|---|---|---|
| **Admin, Manager, Security Officer, Compliance Officer** | SIM — sempre | TOTP ou Security Key | Acesso amplo ao sistema; HIPAA NPRM |
| **Provider acessando PHI** | SIM — para acessar diagnósticos | TOTP ou SMS | Acesso direto a ePHI; HIPAA 164.312(d) |
| **Payer (qualquer role de payer)** | SIM — sempre | TOTP ou Security Key | Covered Entity acessando plataforma; HIPAA |
| **Backoffice (qualquer acesso)** | SIM — sempre | TOTP ou Security Key | Painel administrativo com dados sensíveis |
| **Patient/Family Member (uso normal)** | NÃO (recomendado) | Opcional: SMS | UX do paciente; risco menor |
| **Patient alterando dados sensíveis** | SIM — para alterar CPF, diagnóstico | SMS | Proteção contra account takeover |
| **Worker (onboarding)** | NÃO | Não aplicável | Processo de cadastro inicial |

### 8.3.3 — Configuração do Identity Platform MFA

```bash
# ─────────────────────────────────────────────────────────
# Habilitar MFA no Identity Platform
# ─────────────────────────────────────────────────────────

# 1. Habilitar MFA no projeto
gcloud identity-platform config update \
  --project=enlite-prod \
  --mfa-state=ENABLED \
  --enable-mfa-enrollment

# 2. Configurar provedores MFA
# TOTP (Time-based One-Time Password — Google Authenticator, Authy)
gcloud identity-platform config update \
  --project=enlite-prod \
  --mfa-provider=TOTP

# SMS (para pacientes e fallback)
gcloud identity-platform config update \
  --project=enlite-prod \
  --mfa-provider=PHONE_SMS

# 3. Configurar enforcement por tenant (se multi-tenant)
# O enforcement por ROLE é feito no application layer (auth-service),
# não no Identity Platform diretamente.
```

### 8.3.4 — Enforcement de MFA no auth-service

```typescript
// ─────────────────────────────────────────────────────────
// src/application/use-cases/ValidateMfaRequirementUseCase.ts
// Verifica se MFA é obrigatório para o contexto atual
// HIPAA NPRM: "require MFA with limited exceptions"
// ─────────────────────────────────────────────────────────

export class ValidateMfaRequirementUseCase {
  // Roles que SEMPRE requerem MFA
  private static readonly MFA_REQUIRED_ROLES = new Set([
    'admin', 'manager', 'security_officer', 'compliance_officer',
    'support', 'recruiter', 'community_manager',
    'payer_admin', 'payer_claims_analyst', 'payer_medical_director',
    'clinic_admin',
  ]);

  // Rotas que requerem MFA independente do role
  private static readonly MFA_REQUIRED_PATHS = new Set([
    '/api/v1/backoffice',          // Todo o backoffice
    '/api/v1/patients/*/diagnosis', // Acesso a diagnóstico
    '/api/v1/payers',              // Todo acesso payer
  ]);

  execute(claims: EnLiteCustomClaims, requestPath: string): MfaValidation {
    // 1. Verificar se role requer MFA
    const roleRequiresMfa =
      ValidateMfaRequirementUseCase.MFA_REQUIRED_ROLES.has(claims.role) ||
      (claims.org_roles || []).some(
        or => ValidateMfaRequirementUseCase.MFA_REQUIRED_ROLES.has(or.role)
      );

    // 2. Verificar se path requer MFA
    const pathRequiresMfa = ValidateMfaRequirementUseCase.MFA_REQUIRED_PATHS
      .has(requestPath) ||
      Array.from(ValidateMfaRequirementUseCase.MFA_REQUIRED_PATHS)
        .some(p => this.matchPath(requestPath, p));

    // 3. Se MFA é necessário mas não foi verificado → bloquear
    if ((roleRequiresMfa || pathRequiresMfa) && !claims.mfa_verified) {
      return {
        allowed: false,
        reason: 'mfa_required',
        message: 'Multi-factor authentication is required for this operation.',
        redirectTo: '/auth/mfa-challenge',
      };
    }

    return { allowed: true };
  }

  private matchPath(actual: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]+') + '(/.*)?$');
    return regex.test(actual);
  }
}

interface MfaValidation {
  allowed: boolean;
  reason?: string;
  message?: string;
  redirectTo?: string;
}
```

### 8.3.5 — Middleware de MFA (NestJS)

```typescript
// ─────────────────────────────────────────────────────────
// src/interfaces/middleware/MfaMiddleware.ts
// Middleware que bloqueia requests sem MFA onde obrigatório
// Aplicado APÓS o JWT middleware e ANTES dos controllers
// ─────────────────────────────────────────────────────────

import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class MfaMiddleware implements NestMiddleware {
  constructor(
    private readonly mfaValidator: ValidateMfaRequirementUseCase,
    private readonly auditClient: AuditServiceClient,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const claims = (req as any).authContext?.claims as EnLiteCustomClaims;
    if (!claims) {
      // Sem claims = sem autenticação (tratado pelo AuthMiddleware anterior)
      return next();
    }

    const validation = this.mfaValidator.execute(claims, req.path);

    if (!validation.allowed) {
      // Log de tentativa de acesso sem MFA (possível incidente)
      this.auditClient.logAccess({
        actorUserId: claims.enlite_user_id,
        actorRole: claims.role,
        resourceType: 'mfa_gate',
        resourceId: req.path,
        action: 'access_denied_no_mfa',
        justification: validation.reason || 'mfa_required',
        tenantId: claims.tenant_id,
        ipAddress: req.ip || '',
        serviceName: 'auth-service',
        requestId: req.headers['x-request-id']?.toString() || '',
      });

      res.status(HttpStatus.FORBIDDEN).json({
        success: false,
        error: 'MFA_REQUIRED',
        message: validation.message,
        redirectTo: validation.redirectTo,
      });
      return;
    }

    next();
  }
}
```

---

## 8.4 — Emergency Access Procedure (Break-Glass)

### 8.4.1 — Fundamentação Regulatória

**HIPAA Security Rule — 45 CFR 164.312(a)(2)(ii):** Exige que entidades reguladas estabeleçam (e implementem conforme necessário) procedimentos para obter acesso necessário a ePHI durante emergências.

**Cenários de emergência na EnLite:**
1. Paciente em crise e o sistema de permissões está indisponível
2. Provider precisa acessar diagnóstico urgentemente mas o consent-service está fora
3. Investigação de breach requer acesso imediato a logs
4. Desastre natural e equipe precisa operar em modo degradado

### 8.4.2 — Procedimento de Break-Glass

```
┌──────────────────────────────────────────────────────────────────┐
│              PROCEDIMENTO DE EMERGENCY ACCESS                     │
│                                                                  │
│  PRÉ-REQUISITOS:                                                 │
│  - Somente o Security Official (Bloco 0.5) pode ativar          │
│  - Requer MFA do Security Official (sem exceção)                │
│  - Requer justificativa documentada                             │
│                                                                  │
│  ATIVAÇÃO:                                                       │
│                                                                  │
│  1. Security Official acessa painel de emergência:               │
│     POST /api/v1/backoffice/emergency/activate                   │
│     Body: {                                                      │
│       target_user_id: "uuid",       // Quem recebe acesso       │
│       justification: "string",      // Motivo documentado       │
│       duration_minutes: 60,         // Máximo: 240 (4h)         │
│       scope: "phi_read" | "phi_write" | "full_admin"            │
│     }                                                            │
│     Headers: Authorization (com MFA verificado)                  │
│                                                                  │
│  2. auth-service:                                                │
│     a. Valida que o caller É o Security Official                │
│     b. Valida que MFA está verified                              │
│     c. Valida que duration <= 240 minutos                       │
│     d. Atualiza custom claims do target user:                    │
│        is_emergency_access: true                                 │
│        emergency_expires_at: now() + duration                    │
│     e. NÃO revoga tokens existentes (precisa funcionar imediatamente) │
│     f. Publica evento: emergency_access.activated → audit-service │
│                                                                  │
│  3. audit-service:                                               │
│     a. Registra ativação em compliance.security_incidents:       │
│        incident_type: "emergency_access_activated"               │
│        severity: "high"                                          │
│        affected_user_id: target_user_id                         │
│     b. Inicia timer de revisão obrigatória (24h)                │
│     c. Notifica compliance_officer                              │
│                                                                  │
│  DURANTE O EMERGENCY ACCESS:                                     │
│                                                                  │
│  4. Toda operação do target user:                                │
│     - É executada normalmente (permissões expandidas)           │
│     - É logada com flag is_emergency_access = true               │
│     - CADA acesso a PHI gera audit log separado                  │
│     - Rate limit reduzido (proteção contra abuso)               │
│                                                                  │
│  DESATIVAÇÃO (automática ou manual):                             │
│                                                                  │
│  5a. Automática: quando emergency_expires_at é atingido          │
│      → auth-service job verifica claims expirados a cada 1 min   │
│      → Atualiza claims: is_emergency_access = false              │
│      → Revoga refresh tokens (força re-login)                    │
│      → Publica evento: emergency_access.expired                  │
│                                                                  │
│  5b. Manual: Security Official desativa antes da expiração       │
│      POST /api/v1/backoffice/emergency/deactivate                │
│      → Mesma lógica do 5a, mas imediata                          │
│                                                                  │
│  REVISÃO OBRIGATÓRIA (pós-emergência):                          │
│                                                                  │
│  6. Dentro de 24h após desativação:                              │
│     - Compliance Officer revisa TODOS os logs marcados           │
│       com is_emergency_access = true                             │
│     - Documenta se o acesso foi justificado                     │
│     - Se acesso foi inapropriado → incident report               │
│     - Registro em compliance.security_incidents                  │
│                                                                  │
│  NOTA: Se o sistema de permissões (permission-service) está      │
│  completamente indisponível, o emergency access bypassa a        │
│  verificação de permissões mas NÃO bypassa:                     │
│  - Autenticação (JWT válido é obrigatório)                       │
│  - MFA (se o role requer, continua obrigatório)                  │
│  - Audit logging (NUNCA é bypassado)                             │
│  - Network isolation (phi-service continua isolado)              │
└──────────────────────────────────────────────────────────────────┘
```

### 8.4.3 — Schema: Tabela de Emergency Access

```sql
-- ─────────────────────────────────────────────────────────
-- compliance.emergency_access_log
-- Registro imutável de todo emergency access
-- HIPAA 164.312(a)(2)(ii): Emergency Access Procedure
-- ─────────────────────────────────────────────────────────

CREATE TABLE compliance.emergency_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES iam.users(id),
    activated_by UUID NOT NULL REFERENCES iam.users(id),
    tenant_id UUID NOT NULL REFERENCES iam.tenants(id),
    justification TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('phi_read', 'phi_write', 'full_admin')),
    duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 1 AND 240),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    deactivated_at TIMESTAMPTZ,        -- NULL = ainda ativo ou expirou automaticamente
    deactivated_by UUID REFERENCES iam.users(id),
    deactivation_reason TEXT,
    -- Revisão obrigatória pós-emergência
    review_required_by TIMESTAMPTZ NOT NULL,  -- activated_at + 24h
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES iam.users(id),
    review_outcome TEXT CHECK (review_outcome IN ('justified', 'unjustified', 'escalated')),
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela é APPEND-ONLY: nenhum role pode UPDATE ou DELETE
-- Integridade forense: HIPAA 164.312(b)
REVOKE UPDATE, DELETE ON compliance.emergency_access_log FROM app_service;
REVOKE UPDATE, DELETE ON compliance.emergency_access_log FROM audit_service;

-- Índices para consultas do compliance officer
CREATE INDEX idx_emergency_access_pending_review
    ON compliance.emergency_access_log(review_required_by)
    WHERE reviewed_at IS NULL;

CREATE INDEX idx_emergency_access_user
    ON compliance.emergency_access_log(target_user_id, activated_at);
```

---

## 8.5 — Automatic Logoff

### 8.5.1 — Fundamentação Regulatória

**HIPAA Security Rule — 45 CFR 164.312(a)(2)(iii):** Exige procedimentos para encerrar sessões eletrônicas após período predeterminado de inatividade. Conforme a HHS Technical Safeguards Paper (Security Series #4), muitas aplicações possuem configurações de logoff automático que, após período predeterminado de inatividade, automaticamente encerram a sessão do usuário.

**HIPAA NPRM (Dez/2024):** Propõe tornar auto logoff um requisito obrigatório (não mais addressable), com tempos específicos.

### 8.5.2 — Política de Expiração por Contexto

| Token/Sessão | Duração | Inatividade | Contexto | Justificativa |
|---|---|---|---|---|
| **ID Token (JWT)** | 1 hora | N/A (expira por tempo) | Todos os usuários | Padrão Identity Platform |
| **Refresh Token** | 24 horas | N/A | Usuários regulares | Balanço UX vs segurança |
| **Refresh Token** | 8 horas | N/A | Roles com acesso a PHI | PHI requer sessão mais curta |
| **Sessão Backoffice** | 1 hora | 15 min inatividade | Admin, compliance | Acesso amplo → sessão curta |
| **Sessão PHI (provider)** | 1 hora | 20 min inatividade | Provider acessando diagnóstico | PHI requer logoff por inatividade |
| **Emergency Access** | Máx 4 horas | Sem inatividade (ativo) | Break-glass | Emergência → duração fixa |
| **API Key** | Configurável | N/A | Integrações (n8n, externos) | Rotação obrigatória a cada 90 dias |

### 8.5.3 — Implementação de Inactivity Timeout

O timeout por inatividade é implementado no frontend (client-side) com enforcement no backend (server-side).

```typescript
// ─────────────────────────────────────────────────────────
// Frontend: InactivityMonitor.ts
// Monitora inatividade e força logout
// HIPAA 164.312(a)(2)(iii): Automatic Logoff
// ─────────────────────────────────────────────────────────

export class InactivityMonitor {
  private timer: NodeJS.Timeout | null = null;
  private warningTimer: NodeJS.Timeout | null = null;
  private readonly events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

  constructor(
    private readonly timeoutMs: number,      // Ex: 15 * 60 * 1000 (15 min)
    private readonly warningMs: number,      // Ex: 13 * 60 * 1000 (aviso 2 min antes)
    private readonly onWarning: () => void,
    private readonly onTimeout: () => void,
  ) {}

  start(): void {
    this.resetTimer();
    this.events.forEach(event =>
      document.addEventListener(event, () => this.resetTimer(), { passive: true })
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.warningTimer) clearTimeout(this.warningTimer);
    this.events.forEach(event =>
      document.removeEventListener(event, () => this.resetTimer())
    );
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.warningTimer) clearTimeout(this.warningTimer);

    this.warningTimer = setTimeout(() => {
      this.onWarning();  // Mostra dialog "Sua sessão vai expirar em 2 minutos"
    }, this.warningMs);

    this.timer = setTimeout(() => {
      this.onTimeout();  // Força logout + limpa tokens + redireciona para login
    }, this.timeoutMs);
  }
}
```

```typescript
// ─────────────────────────────────────────────────────────
// Backend: SessionValidationMiddleware.ts
// Enforcement server-side de session timeout
// Funciona mesmo se o frontend for manipulado
// ─────────────────────────────────────────────────────────

@Injectable()
export class SessionValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const claims = (req as any).authContext?.claims as EnLiteCustomClaims;
    if (!claims) return next();

    // 1. Verificar se emergency access expirou
    if (claims.is_emergency_access && claims.emergency_expires_at) {
      const expiresAt = new Date(claims.emergency_expires_at);
      if (new Date() > expiresAt) {
        res.status(401).json({
          success: false,
          error: 'EMERGENCY_ACCESS_EXPIRED',
          message: 'Emergency access has expired. Please re-authenticate.',
        });
        return;
      }
    }

    // 2. Verificar token age para roles sensíveis
    const tokenIssuedAt = (req as any).authContext?.issuedAt;
    if (tokenIssuedAt) {
      const tokenAge = Date.now() - tokenIssuedAt * 1000;
      const maxAge = this.getMaxTokenAge(claims.role);
      if (tokenAge > maxAge) {
        res.status(401).json({
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please re-authenticate.',
        });
        return;
      }
    }

    next();
  }

  private getMaxTokenAge(role: string): number {
    // Backoffice/admin: 1 hora máximo
    if (['admin', 'manager', 'security_officer', 'compliance_officer'].includes(role)) {
      return 60 * 60 * 1000;  // 1h
    }
    // Provider com acesso PHI: 1 hora
    if (role === 'provider') {
      return 60 * 60 * 1000;  // 1h
    }
    // Payer: 1 hora
    if (role.startsWith('payer_')) {
      return 60 * 60 * 1000;  // 1h
    }
    // Demais: token padrão (1h do Identity Platform)
    return 60 * 60 * 1000;
  }
}
```

---

## 8.6 — Revogação de Acesso e Offboarding

### 8.6.1 — Fundamentação Regulatória

**HIPAA Security Rule — 45 CFR 164.308(a)(3)(ii)(C):** Termination procedures — procedimentos para remoção de acesso a ePHI quando o emprego termina ou conforme o item anterior.

**HIPAA NPRM (Dez/2024):** Propõe "require notification of certain regulated entities within 24 hours when a workforce member's access to ePHI or certain electronic information systems is changed or terminated."

### 8.6.2 — Fluxo de Revogação

```typescript
// ─────────────────────────────────────────────────────────
// src/application/use-cases/RevokeUserAccessUseCase.ts
// Revoga todo o acesso de um usuário
// HIPAA 164.308(a)(3)(ii)(C): Termination Procedures
// HIPAA NPRM: notificação em 24h de alteração de acesso
// ─────────────────────────────────────────────────────────

export class RevokeUserAccessUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly auditClient: AuditServiceClient,
  ) {}

  async execute(params: {
    targetUserId: string;
    revokedBy: string;
    reason: string;
    effectiveImmediately: boolean;
  }): Promise<void> {
    const user = await this.userRepository.findById(params.targetUserId);
    if (!user) throw new Error(`User not found: ${params.targetUserId}`);

    // 1. Desativar no banco (soft-delete)
    await this.userRepository.update(user.firebase_uid, {
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: params.revokedBy,
      deactivation_reason: params.reason,
    });

    // 2. Revogar TODOS os tokens no Identity Platform
    // Isso invalida imediatamente todos os JWTs em uso
    await admin.auth().revokeRefreshTokens(user.firebase_uid);

    // 3. Limpar custom claims
    await admin.auth().setCustomUserClaims(user.firebase_uid, {
      enlite_user_id: user.id,
      tenant_id: user.tenant_id,
      region: user.region,
      role: 'deactivated',
      mfa_verified: false,
      is_emergency_access: false,
      claims_version: 0,
      last_permission_sync: new Date().toISOString(),
    });

    // 4. Se acesso imediato: desabilitar conta no Identity Platform
    if (params.effectiveImmediately) {
      await admin.auth().updateUser(user.firebase_uid, {
        disabled: true,
      });
    }

    // 5. Audit log
    await this.auditClient.logAccess({
      actorUserId: params.revokedBy,
      actorRole: 'admin',
      resourceType: 'user_access',
      resourceId: user.id,
      action: 'revoke',
      justification: params.reason,
      tenantId: user.tenant_id,
      ipAddress: '',
      serviceName: 'auth-service',
      requestId: crypto.randomUUID(),
    });

    // 6. Publicar evento para outros serviços limparem cache
    await this.pubSubClient.publish('user-events', {
      event_type: 'user.access.revoked',
      payload: {
        user_id: user.id,
        firebase_uid: user.firebase_uid,
        revoked_at: new Date().toISOString(),
      },
    });
  }
}
```

---

## 8.7 — Segurança de Credenciais e Secrets

### 8.7.1 — Política de Senhas

```typescript
// Configuração do Identity Platform
// Aplicada no nível do projeto GCP
const passwordPolicy = {
  minLength: 12,                    // Mínimo 12 caracteres
  requireUppercase: true,
  requireLowercase: true,
  requireNumeric: true,
  requireSpecialChar: true,
  maxConsecutiveIdentical: 3,       // Máx 3 chars iguais seguidos
  recentPasswordsBlocked: 6,       // Últimas 6 senhas não podem ser reusadas
  // NIST 800-63B: não exigir rotação periódica (causa senhas fracas)
  // Em vez disso: breach detection + forced change se comprometida
};
```

### 8.7.2 — Rotação de API Keys e Secrets

| Secret | Rotação | Mecanismo | Monitoramento |
|---|---|---|---|
| API Keys (n8n, integrações) | 90 dias | Secret Manager versioning | Alerta 7 dias antes da expiração |
| Database passwords (SA) | Automática | Cloud SQL IAM authentication | N/A (sem password) |
| KMS keys | Anual | Cloud KMS auto-rotation | Cloud Monitoring |
| Service account keys | NENHUMA | Workload Identity (sem keys) | N/A |
| JWT signing keys | Automática | Identity Platform managed | N/A |

---

## 8.8 — Matriz de Compliance: Checklist do Bloco 8

| Requisito Regulatório | Referência | Controle Implementado | Status |
|---|---|---|---|
| Unique User Identification | HIPAA 164.312(a)(2)(i) | Identity Platform UID + enlite_user_id em claims | ✅ Definido |
| Emergency Access Procedure | HIPAA 164.312(a)(2)(ii) | Break-glass com scope, duração, audit, revisão 24h | ✅ Definido |
| Automatic Logoff | HIPAA 164.312(a)(2)(iii) | JWT 1h + refresh 8-24h + inactivity timeout 15-20 min | ✅ Definido |
| Encryption (auth tokens) | HIPAA 164.312(a)(2)(iv) | JWT assinado + TLS 1.3 em trânsito | ✅ Definido |
| Person/Entity Authentication | HIPAA 164.312(d) | Identity Platform + MFA obrigatório por role | ✅ Definido |
| MFA obrigatório | HIPAA NPRM | TOTP/SMS/Security Key; enforcement por role e path | ✅ Definido |
| Notificação 24h de alteração | HIPAA NPRM | Revogação imediata + audit event + notificação | ✅ Definido |
| Termination Procedures | HIPAA 164.308(a)(3)(ii)(C) | RevokeUserAccessUseCase com disable imediato | ✅ Definido |
| Workforce Security | HIPAA 164.308(a)(3) | Auto-provisioning com domain verification | ✅ Definido |
| Security Awareness (auth) | HIPAA 164.308(a)(5) | MFA enrollment guidance no onboarding | ✅ Definido |
| Password Policy | HIPAA 164.312(d) | 12+ chars, complexidade, breach detection | ✅ Definido |
| Segurança Técnica | LGPD Art. 46 | Todos os controles acima combinados | ✅ Definido |
| Confidencialidade | GDPR Art. 32(1)(b) | MFA + session management + encryption | ✅ Definido |
| Resiliência | GDPR Art. 32(1)(b) | Emergency access procedure | ✅ Definido |
| BAA com Identity Platform | HIPAA 164.314 | Google Cloud BAA cobre Identity Platform | ✅ Verificado |

---

## 8.9 — Gaps e Dependências

| Gap | Bloco Responsável | Impacto |
|---|---|---|
| Signed URLs para media (auth context) | Bloco 9 | Media-service precisa validar auth para gerar URLs |
| Audit dashboard para emergency access reviews | Bloco 12 | Compliance officer precisa UI para revisão |
| Cloud Armor integration com auth failures | Bloco 10/13 | Bloqueio automático de IPs com muitas falhas de auth |
| Security awareness training sobre MFA | Bloco 0.6 (operacional) | Treinamento de equipe |
| Phishing-resistant MFA (FIDO2/WebAuthn) | Futuro | OCR recomenda; mais seguro que TOTP/SMS |

---

*EnLite Health Solutions — Bloco 8: Autenticação*  
*Jurisdições: LGPD (BR), HIPAA (US), GDPR (EU), Ley 25.326 (AR)*  
*Fontes: hhs.gov/hipaa (Security Rule, NPRM, OCR Cybersecurity Newsletters), Guia LGPD Gov.BR, GDPR*  
*Abril 2026*
