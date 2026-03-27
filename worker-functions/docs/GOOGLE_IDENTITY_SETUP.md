# 🔐 Google Cloud Identity Platform - Setup Guide

## ✅ Confirmação da Stack de Autenticação

**IMPORTANTE:** Este projeto usa **Google Cloud Identity Platform** (não Firebase Auth).

### Por que Google Identity Platform?

✅ **HIPAA Compliant** - BAA (Business Associate Agreement) disponível
✅ **Separado do Firebase** - Produto GCP enterprise
✅ **Email Link Verification** - Link de confirmação (não OTP)
✅ **REST API** - Integração via HTTP (sem SDK Firebase)

---

## 🚀 Setup Passo a Passo

### 1. Ativar Identity Platform no GCP

```bash
# Ativar API
gcloud services enable identitytoolkit.googleapis.com

# Ou via Console:
# https://console.cloud.google.com → Identity Platform → Enable
```

### 2. Configurar Provedores

```
GCP Console → Identity Platform → Providers

Ativar:
✅ Email/Password
✅ Google Sign-In (OAuth 2.0)
```

### 3. Configurar Email Templates

```
Identity Platform → Settings → Email Templates

Template: Email Verification
- Customize com branding Enlite
- Subject: "Confirme seu email - Enlite Health"
- Body: Incluir link de verificação
```

### 4. Obter Credenciais

```
Identity Platform → Settings → Web API Key
Copiar: AIza...

Adicionar ao .env:
IDENTITY_PLATFORM_API_KEY=AIza...
```

### 5. Configurar Authorized Domains

```
Identity Platform → Settings → Authorized Domains

Adicionar:
- localhost (dev)
- seu-dominio-react.dev (staging)
- app.enlitehealth.com (prod)
```

### 6. Aceitar BAA (HIPAA)

```
GCP Console → IAM & Admin → Legal and Compliance
Selecionar: Identity Platform
Aceitar: Business Associate Agreement (BAA)
```

---

## 📡 Endpoints da API

### Base URL
```
https://identitytoolkit.googleapis.com/v1/accounts
```

### 1. Sign Up (Criar Conta)

```http
POST /accounts:signUp?key={API_KEY}
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "senha123",
  "returnSecureToken": true
}

Response:
{
  "idToken": "eyJhbGc...",
  "email": "user@example.com",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "uid123"
}
```

### 2. Enviar Email de Verificação

```http
POST /accounts:sendOobCode?key={API_KEY}
Content-Type: application/json

{
  "requestType": "VERIFY_EMAIL",
  "idToken": "eyJhbGc..."
}

Response:
{
  "email": "user@example.com"
}
```

**O usuário receberá um email com link de confirmação.**

### 3. Sign In (Login)

```http
POST /accounts:signInWithPassword?key={API_KEY}
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "senha123",
  "returnSecureToken": true
}

Response:
{
  "idToken": "eyJhbGc...",
  "email": "user@example.com",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "uid123",
  "registered": true
}
```

### 4. Refresh Token

```http
POST https://securetoken.googleapis.com/v1/token?key={API_KEY}
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "..."
}

Response:
{
  "id_token": "eyJhbGc...",
  "refresh_token": "...",
  "expires_in": "3600"
}
```

### 5. Get User Info

```http
POST /accounts:lookup?key={API_KEY}
Content-Type: application/json

{
  "idToken": "eyJhbGc..."
}

Response:
{
  "users": [{
    "localId": "uid123",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "User Name",
    "photoUrl": "https://...",
    "passwordHash": "...",
    "providerUserInfo": [...],
    "validSince": "1234567890",
    "lastLoginAt": "1234567890",
    "createdAt": "1234567890"
  }]
}
```

---

## 🔄 Fluxo de Autenticação

### Signup Flow

```
1. User preenche email/senha
2. React app → POST /accounts:signUp
3. Backend retorna idToken + uid
4. React app → POST /accounts:sendOobCode (VERIFY_EMAIL)
5. User recebe email com link
6. User clica no link
7. Email é verificado automaticamente
8. User pode fazer login
```

### Login Flow

```
1. User preenche email/senha
2. React app → POST /accounts:signInWithPassword
3. Backend retorna idToken + uid
4. React app salva no state/context
5. React app → GET /api/workers/me (com idToken no header)
6. Backend valida token e retorna dados
7. Navigate para step atual
```

### Token Refresh Flow

```
1. Antes de cada API call, verificar se token expira em < 5 min
2. Se sim: POST /token com refreshToken
3. Atualizar idToken no React state/context
4. Continuar com API call
```

---

## 🛡️ Validação de Token no Backend

### Middleware de Autenticação

```typescript
import admin from 'firebase-admin';

// Inicializar (usa Identity Platform por baixo)
if (!admin.apps.length) {
  admin.initializeApp();
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { 
      uid: decoded.uid, 
      email: decoded.email 
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Nota:** O `firebase-admin` SDK funciona com Google Identity Platform também.

---

## 📱 Integração React

### State/Context Variables

```
- idToken: String (JWT)
- uid: String (User ID)
- refreshToken: String
- apiKey: String (do .env)
- email: String
- emailVerified: Boolean
```

### Funções/Actions Necessárias

1. **signUpWithIdentityPlatform** - Criar conta
2. **sendEmailVerification** - Enviar email
3. **signInWithIdentityPlatform** - Login
4. **refreshIdToken** - Refresh token
5. **signOut** - Logout (limpar state)

Consulte a documentação do React para código completo.

---

## 🧪 Testes

### Testar Signup

```bash
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "returnSecureToken": true
  }'
```

### Testar Email Verification

```bash
# Usar idToken do signup
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "requestType": "VERIFY_EMAIL",
    "idToken": "eyJhbGc..."
  }'
```

### Testar Login

```bash
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "returnSecureToken": true
  }'
```

---

## 🔐 Segurança

### HIPAA Compliance

✅ **BAA Aceito** - Contrato assinado com Google
✅ **Encryption at Rest** - Dados criptografados
✅ **Encryption in Transit** - HTTPS obrigatório
✅ **Audit Logs** - Todos os logins registrados
✅ **Data Residency** - southamerica-east1

### Best Practices

1. **Nunca expor API Key no frontend** - Usar variável de ambiente
2. **Sempre validar token no backend** - Usar `admin.auth().verifyIdToken()`
3. **Refresh token antes de expirar** - < 5 minutos
4. **Logout limpa todos os tokens** - App State + localStorage
5. **Email verification obrigatória** - Verificar `emailVerified: true`

---

## 📊 Monitoramento

### Logs no GCP

```
GCP Console → Logging → Logs Explorer

Filtros:
- resource.type="identitytoolkit.googleapis.com/Project"
- protoPayload.methodName="google.cloud.identitytoolkit.v1.AuthenticationService.SignInWithPassword"
```

### Métricas

```
GCP Console → Monitoring → Metrics Explorer

Métricas:
- identitytoolkit.googleapis.com/account/sign_in_count
- identitytoolkit.googleapis.com/account/sign_up_count
- identitytoolkit.googleapis.com/account/verification_email_sent_count
```

---

## 🆘 Troubleshooting

### Email não chega

1. Verificar spam/lixeira
2. Verificar template configurado
3. Verificar logs: `protoPayload.methodName="SendOobCode"`
4. Testar com outro provedor de email

### Token inválido (401)

1. Verificar se token não expirou (1 hora)
2. Verificar formato: `Bearer eyJhbGc...`
3. Verificar se email foi verificado
4. Usar refresh token

### BAA não disponível

1. Verificar se projeto GCP tem billing ativo
2. Verificar se Identity Platform está ativado (não Firebase Auth)
3. Contatar suporte GCP se necessário

---

## 📚 Recursos

- [Identity Platform Documentation](https://cloud.google.com/identity-platform/docs)
- [REST API Reference](https://cloud.google.com/identity-platform/docs/reference/rest)
- [Email Templates](https://cloud.google.com/identity-platform/docs/how-to-enable-application-verification)
- [HIPAA Compliance](https://cloud.google.com/security/compliance/hipaa)
- [BAA Information](https://cloud.google.com/terms/service-terms)
