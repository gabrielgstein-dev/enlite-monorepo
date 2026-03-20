# 🔐 Authorization Architecture & Integration Guide

## Overview

The Enlite Health platform implements a **multi-strategy authentication and authorization system** designed to be:

- **Secure**: HIPAA-compliant, no PII in tokens
- **Extensible**: Easy migration from local policies to Cerbos
- **Multi-tenant**: Support for various client types (React frontend, n8n, external SaaS)
- **Future-proof**: Ready for distributed authorization with Cerbos

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUESTS                           │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│   React     │     n8n     │  External   │   Admin Dashboard │
│   (JWT)     │  (API Key)  │   SaaS      │   (Google ID)     │
└──────┬──────┴──────┬──────┴──────┬──────┴─────────┬─────────┘
       │             │             │                │
       └─────────────┴─────────────┴────────────────┘
                         │
              ┌──────────▼──────────┐
              │  MultiAuthService   │
              │  (Authentication)   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  AuthMiddleware   │
              │  (Express Layer)    │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
┌────────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│LocalAuthEngine│ │CerbosAdapter│ │ Future...   │
│  (Current)    │ │  (Future)   │ │             │
└───────────────┘ └─────────────┘ └─────────────┘
```

## Authentication Strategies

### 1. API Keys (For Services)

**Use Cases**: n8n, external SaaS integrations, service-to-service communication

**Headers**:
```
X-Api-Key: enlite_abc123...
```

**Pre-configured API Keys**:
Set via environment variable:
```bash
ENLITE_API_KEYS=n8n:enlite_key1,react_frontend:enlite_key2,saas_partner:enlite_key3
```

**Generate new API Key**:
```typescript
const authService = new MultiAuthService(config);
const { apiKey, secret, expiresAt } = await authService.generateApiKey(
  'n8n',
  ['workers:read', 'workers:write', 'webhooks:execute'],
  365 // expires in 365 days
);
```

### 2. JWT Tokens (For React Frontend Users)

**Use Cases**: React web app users

**Headers**:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Implementation Status**: Stubbed, needs JWT verification implementation

### 3. Google ID Tokens (For Google Identity)

**Use Cases**: Direct Google Identity Platform integration

**Headers**:
```
X-Google-Id-Token: eyJhbGciOiJSUzI1NiIs...
```

**Implementation Status**: Stubbed, needs Google token verification

### 4. Internal Tokens (Service-to-Service)

**Use Cases**: Microservices communication within Enlite infrastructure

**Headers**:
```
X-Internal-Token: internal_...
```

## Authorization Levels

### Current Implementation (LocalAuthorizationEngine)

**Roles**:
- `worker`: Standard worker users
- `admin`: Administrative users
- `super_admin`: Super administrators (cross-tenant)
- `service_worker`: Internal services
- `n8n_worker`: n8n automation workflows
- `external_client`: External SaaS partners
- `readonly`: Read-only access

**Permissions Matrix**:

| Resource | Action | Worker | Admin | Service | n8n | External |
|----------|--------|--------|-------|---------|-----|----------|
| Worker | create | ❌ | ✅ | ✅ | ✅ | ❌ |
| Worker | read | ✅* | ✅ | ✅ | ✅ | ✅* |
| Worker | update | ✅* | ✅ | ✅ | ❌ | ❌ |
| Worker | delete | ❌ | ✅ | ❌ | ❌ | ❌ |
| Worker | list | ❌ | ✅ | ✅ | ✅ | ❌ |
| User | delete | ✅* | ✅ | ✅ | ❌ | ❌ |
| User | admin_delete | ❌ | ✅ | ❌ | ❌ | ❌ |
| Webhook | execute | ❌ | ✅ | ✅ | ✅ | ❌ |

*Only own resources

### Future Implementation (Cerbos)

**Migration Path**:
1. Deploy Cerbos as sidecar/container
2. Define policies as YAML/JSON
3. Switch `USE_CERBOS=true`
4. Policies managed centrally

**Example Cerbos Policy**:
```yaml
apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: default
  resource: worker
  rules:
    - actions: ['read', 'update']
      roles:
        - worker
        - admin
        - service_worker
      effect: EFFECT_ALLOW
      condition:
        match:
          expr: request.resource.attr.ownerId == request.principal.id
```

## n8n Integration

### 1. Generate API Key for n8n

```typescript
const { apiKey, secret } = await authService.generateApiKey(
  'n8n',
  [
    'workers:read',      // List workers
    'workers:write',     // Update worker status
    'webhooks:execute',  // Trigger webhooks
  ],
  365
);
```

### 2. Configure n8n HTTP Request Node

**Headers**:
```json
{
  "X-Api-Key": "{{$env.ENLITE_N8N_API_KEY}}",
  "Content-Type": "application/json"
}
```

**Example Workflow**: Worker Onboarding

```
[Webhook Trigger] → [Enlite API: Get Worker] → [HubSpot: Create Contact]
                                         ↓
                              [Twilio: Send SMS]
                                         ↓
                              [Google Calendar: Create Event]
```

### 3. n8n Webhook Endpoint

```typescript
// Protected endpoint for n8n callbacks
app.post('/api/internal/workers/webhook', 
  authMiddleware.requireApiKey(),
  (req, res) => {
    // Process n8n workflow results
    res.json({ success: true });
  }
);
```

## External SaaS Integration

### Partner Onboarding

1. **Register Partner**:
```typescript
const partnerConfig = {
  name: 'healthcare_saas_partner',
  allowedScopes: ['workers:read'], // Read-only
  rateLimit: 1000, // requests per hour
  ipWhitelist: ['203.0.113.0/24'], // Optional IP restriction
};
```

2. **Generate Credentials**:
```typescript
const { apiKey } = await authService.generateApiKey(
  partnerConfig.name,
  partnerConfig.allowedScopes,
  90 // Short expiry for external partners
);
```

3. **Document Integration**:
```markdown
## Enlite API Integration

Base URL: https://api.enlite.health

### Authentication
Header: X-Api-Key: {your_api_key}

### Endpoints
- GET /api/workers/:id - Get worker details
- POST /api/internal/workers/webhook - Webhook callback

### Rate Limits
- 1000 requests/hour
- Contact support for increases
```

## Environment Configuration

### Required Environment Variables

```bash
# Authentication
GOOGLE_CLIENT_ID=your-google-client-id
INTERNAL_TOKEN_SECRET=your-internal-secret

# API Keys
ENLITE_API_KEYS=n8n:key1,react_frontend:key2

# Cerbos (Optional)
USE_CERBOS=false
CERBOS_ENDPOINT=http://localhost:3592

# Development
NODE_ENV=development
```

### Docker Compose with Cerbos

```yaml
version: '3.8'
services:
  api:
    build: .
    environment:
      - USE_CERBOS=true
      - CERBOS_ENDPOINT=http://cerbos:3592
  
  cerbos:
    image: ghcr.io/cerbos/cerbos:latest
    ports:
      - "3592:3592"
      - "3593:3593"
    volumes:
      - ./policies:/policies
```

## Security Best Practices

### HIPAA Compliance

1. **No PII in Tokens**: Use UUIDs or hashed IDs
2. **Audit Logging**: All access attempts logged (without PII)
3. **Token Expiration**: Short-lived tokens with refresh
4. **Secure Storage**: API keys in Secret Manager, not code

### Implementation Guidelines

```typescript
// ✅ GOOD: Use auth context from middleware
const authContext = AuthMiddleware.getAuthContext(req);
const workerId = authContext?.principal.id;

// ❌ BAD: Trust client-provided IDs without verification
const workerId = req.body.workerId; // Could be any ID!
```

### Rate Limiting

```typescript
// Add rate limiting per principal type
app.use('/api/', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    const authContext = AuthMiddleware.getAuthContext(req);
    // Higher limits for internal services
    return authContext?.principal.type === 'service' ? 10000 : 1000;
  },
}));
```

## Testing

### Unit Tests

```typescript
// Test authentication
const authService = new MultiAuthService(config);
const credentials = { type: CredentialType.API_KEY, token: 'test-key', scopes: [] };
const context = await authService.authenticate(credentials, metadata);
expect(context?.principal.type).toBe('service');
```

### Integration Tests

```bash
# Test with curl
curl -H "X-Api-Key: enlite_test_key" \
     https://api.enlite.health/api/workers/me
```

## Migration to Cerbos

### Step 1: Deploy Cerbos

```bash
docker run -p 3592:3592 \
  -v $(pwd)/policies:/policies \
  ghcr.io/cerbos/cerbos:latest
```

### Step 2: Convert Policies

Local policies → YAML format (see example above)

### Step 3: Enable Cerbos

```bash
export USE_CERBOS=true
export CERBOS_ENDPOINT=http://localhost:3592
```

### Step 4: Verify

```typescript
// Same code works - adapter handles the switch
const decision = await authzEngine.checkPermission(
  context,
  { type: 'worker', id: workerId },
  'read'
);
```

## Summary

- ✅ **Current**: Local authorization engine with API key support
- 🔄 **Next**: JWT implementation for React frontend
- 📅 **Future**: Cerbos integration for distributed authorization
- 🔒 **Security**: HIPAA-compliant, no PII leakage
- 🔌 **Integration**: Ready for n8n, external SaaS, and internal services
