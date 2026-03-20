# 📡 API Documentation - Enlite Health Platform

API RESTful para gerenciamento de workers (profissionais de saúde) na plataforma Enlite Health.

**Base URL (Local)**: `http://localhost:8080`

**Base URL (Production)**: `https://api.enlitehealth.com` *(a configurar)*

---

## 🔐 Autenticação

A API utiliza Google Cloud Identity Platform para autenticação. O `authUid` deve ser obtido do Firebase/GCP Identity Platform.

Para endpoints que requerem autenticação, envie o header:

```
x-auth-uid: <firebase-uid>
```

---

## 📋 Endpoints

### 1. Health Check

Verifica se a API está funcionando.

**Endpoint**: `GET /health`

**Autenticação**: Não requerida

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-16T23:49:00.000Z"
}
```

**Status Codes**:
- `200 OK` - API funcionando normalmente

---

### 2. Inicializar Worker

Cria um novo worker no sistema ou retorna o worker existente.

**Endpoint**: `POST /api/workers/init`

**Autenticação**: Não requerida (usa authUid no body)

**Request Body**:
```json
{
  "authUid": "firebase-uid-abc123",
  "fullName": "João Silva",
  "email": "joao.silva@example.com",
  "phone": "+5511999999999"
}
```

**Validações**:
- `authUid`: Required, string
- `fullName`: Required, string, min 3 chars
- `email`: Required, valid email format
- `phone`: Required, valid phone format (E.164)

**Response Success** (`201 Created` ou `200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "authUid": "firebase-uid-abc123",
    "fullName": "João Silva",
    "email": "joao.silva@example.com",
    "phone": "+5511999999999",
    "currentStep": 1,
    "status": "pending",
    "createdAt": "2026-03-16T23:49:00.000Z",
    "updatedAt": "2026-03-16T23:49:00.000Z"
  }
}
```

**Response Error** (`400 Bad Request`):
```json
{
  "success": false,
  "error": "Email already registered"
}
```

**Status Codes**:
- `201 Created` - Worker criado com sucesso
- `200 OK` - Worker já existia, retornado
- `400 Bad Request` - Dados inválidos ou email duplicado
- `500 Internal Server Error` - Erro no servidor

**Side Effects**:
- Dispara evento `worker.created` para n8n

---

### 3. Salvar Progresso de Step

Atualiza o step atual do worker e salva dados associados.

**Endpoint**: `PUT /api/workers/step`

**Autenticação**: Não requerida (usa workerId no body)

**Request Body**:
```json
{
  "workerId": "550e8400-e29b-41d4-a716-446655440000",
  "step": 2,
  "data": {
    "address": "Rua Example, 123",
    "city": "São Paulo",
    "state": "SP"
  }
}
```

**Validações**:
- `workerId`: Required, valid UUID
- `step`: Required, integer 1-10
- `data`: Optional, object com dados do step

**Response Success** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "authUid": "firebase-uid-abc123",
    "fullName": "João Silva",
    "email": "joao.silva@example.com",
    "phone": "+5511999999999",
    "currentStep": 2,
    "status": "in_progress",
    "createdAt": "2026-03-16T23:49:00.000Z",
    "updatedAt": "2026-03-16T23:50:00.000Z"
  }
}
```

**Response Error** (`400 Bad Request`):
```json
{
  "success": false,
  "error": "Cannot go back to previous steps"
}
```

**Status Codes**:
- `200 OK` - Step atualizado com sucesso
- `400 Bad Request` - Dados inválidos ou regra de negócio violada
- `404 Not Found` - Worker não encontrado
- `500 Internal Server Error` - Erro no servidor

**Business Rules**:
- Não é permitido voltar para steps anteriores
- Step 10 automaticamente muda status para `review`
- Steps intermediários mudam status para `in_progress`

**Side Effects**:
- Dispara evento `worker.step.completed` para n8n
- Se status mudou, dispara evento `worker.status.changed`

---

### 4. Obter Progresso do Worker

Retorna os dados e progresso do worker autenticado.

**Endpoint**: `GET /api/workers/me`

**Autenticação**: **Requerida**

**Headers**:
```
x-auth-uid: firebase-uid-abc123
```

**Response Success** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "authUid": "firebase-uid-abc123",
    "fullName": "João Silva",
    "email": "joao.silva@example.com",
    "phone": "+5511999999999",
    "currentStep": 2,
    "status": "in_progress",
    "createdAt": "2026-03-16T23:49:00.000Z",
    "updatedAt": "2026-03-16T23:50:00.000Z"
  }
}
```

**Response Error** (`404 Not Found`):
```json
{
  "success": false,
  "error": "Worker not found"
}
```

**Status Codes**:
- `200 OK` - Worker encontrado
- `401 Unauthorized` - Header de autenticação ausente
- `404 Not Found` - Worker não encontrado
- `500 Internal Server Error` - Erro no servidor

---

## 📊 Data Models

### Worker

```typescript
{
  id: string;              // UUID v4
  authUid: string;         // Firebase/GCP Identity UID
  fullName: string;        // Nome completo
  email: string;           // Email único
  phone: string;           // Telefone (E.164 format)
  currentStep: number;     // Step atual (1-10)
  status: WorkerStatus;    // Status do onboarding
  createdAt: Date;         // Data de criação
  updatedAt: Date;         // Data da última atualização
}
```

### WorkerStatus

```typescript
type WorkerStatus = 
  | 'pending'      // Cadastro iniciado
  | 'in_progress'  // Preenchendo formulário
  | 'review'       // Aguardando revisão
  | 'approved'     // Aprovado
  | 'rejected';    // Rejeitado
```

---

## 🔄 Workflow de Onboarding

```
Step 1: Dados Pessoais (nome, email, telefone)
Step 2: Endereço e Localização → Dispara HubSpot CRM
Step 3: Documentos (CPF, RG, etc.)
Step 4: Disponibilidade → Dispara Google Calendar
Step 5: Áreas de Atendimento
Step 6: Especialidades
Step 7: Experiência Profissional
Step 8: Referências
Step 9: Vídeo de Apresentação
Step 10: Quiz de Compliance → Status = 'review', Dispara SMS Twilio
```

---

## 🧪 Exemplos de Uso

### Fluxo Completo (cURL)

```bash
# 1. Inicializar worker
WORKER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/workers/init \
  -H "Content-Type: application/json" \
  -d '{
    "authUid": "test-uid-123",
    "fullName": "Maria Santos",
    "email": "maria.santos@example.com",
    "phone": "+5511988887777"
  }')

WORKER_ID=$(echo $WORKER_RESPONSE | jq -r '.data.id')

# 2. Salvar step 2
curl -X PUT http://localhost:8080/api/workers/step \
  -H "Content-Type: application/json" \
  -d "{
    \"workerId\": \"$WORKER_ID\",
    \"step\": 2,
    \"data\": {
      \"address\": \"Av. Paulista, 1000\",
      \"city\": \"São Paulo\",
      \"state\": \"SP\"
    }
  }"

# 3. Obter progresso
curl -X GET http://localhost:8080/api/workers/me \
  -H "x-auth-uid: test-uid-123"
```

### Fluxo Completo (JavaScript/Fetch)

```javascript
// 1. Inicializar worker
const initResponse = await fetch('http://localhost:8080/api/workers/init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    authUid: 'firebase-uid-xyz',
    fullName: 'Pedro Oliveira',
    email: 'pedro@example.com',
    phone: '+5521987654321'
  })
});

const { data: worker } = await initResponse.json();

// 2. Salvar step 3
await fetch('http://localhost:8080/api/workers/step', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workerId: worker.id,
    step: 3,
    data: {
      cpf: '123.456.789-00',
      rg: '12.345.678-9'
    }
  })
});

// 3. Obter progresso
const progressResponse = await fetch('http://localhost:8080/api/workers/me', {
  headers: { 'x-auth-uid': 'firebase-uid-xyz' }
});

const { data: progress } = await progressResponse.json();
console.log(`Current step: ${progress.currentStep}`);
```

---

## 🔐 Compliance & Security

### HIPAA Compliance

- ✅ Nenhum PII é registrado em logs
- ✅ Todas as atualizações são auditadas via `updated_at`
- ✅ IDs são UUID v4 para anonimização
- ✅ Dados criptografados em repouso (PostgreSQL)

### Rate Limiting

*(A implementar)*

- 100 requests/minuto por IP
- 1000 requests/hora por authUid

### CORS

*(A configurar em produção)*

```javascript
// Permitir apenas domínios autorizados
const allowedOrigins = [
  'https://app.enlitehealth.com',
  'https://admin.enlitehealth.com'
];
```

---

## 📞 Suporte

Para dúvidas sobre a API:
- Consulte [`README.md`](../README.md)
- Veja exemplos em [`SETUP.md`](../SETUP.md)
- Verifique workflows n8n em [`n8n-workflows/`](../n8n-workflows/)
