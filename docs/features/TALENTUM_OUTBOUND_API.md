# Talentum Outbound API — Documentacao Completa

> Documentacao reversa da API REST da Talentum.chat, obtida via engenharia reversa do frontend + testes reais em producao.
> Ultima atualizacao: 2026-04-02

---

## Indice

1. [Contexto](#contexto)
2. [Autenticacao](#autenticacao)
3. [Endpoints](#endpoints)
   - [POST /auth/login](#1-post-authlogin)
   - [GET /users/me](#2-get-usersme)
   - [POST /pre-screening/projects](#3-post-pre-screeningprojects)
   - [GET /pre-screening/projects](#4-get-pre-screeningprojects)
   - [GET /pre-screening/projects/:projectId](#5-get-pre-screeningprojectsprojectid)
   - [DELETE /pre-screening/projects/:projectId](#6-delete-pre-screeningprojectsprojectid)
4. [Link do Bot WhatsApp](#link-do-bot-whatsapp)
5. [Mapeamento Enlite-Talentum](#mapeamento-enlite--talentum)
6. [Testes Realizados](#testes-realizados)

---

## Contexto

### Fluxo atual (inbound — ja implementado)
```
Talentum (bot WhatsApp) → n8n webhook → Enlite (ProcessTalentumPrescreening)
```

### Fluxo novo (outbound + inbound)
```
Admin cria/edita Vacante no Enlite + ativa switch "Publicar en Talentum"
  → Backend faz login na API Talentum (RSA-OAEP + cookie auth)
  → Backend chama POST /pre-screening/projects com dados da vaga + perguntas
  → Talentum retorna projectId + publicId
  → Backend chama GET /pre-screening/projects/:id para obter whatsappUrl + slug
  → Enlite salva referencia na vaga (job_postings)
  → Admin ve o link do bot WhatsApp na tela de detalhe da vaga
  → Admin compartilha link com candidatos
  → Candidato faz prescreening via WhatsApp (Talentum)
  → Talentum envia resultados via webhook → fluxo existente (ProcessTalentumPrescreening)
```

**Nota:** O POST de criacao retorna apenas `{ projectId, publicId }`. O `whatsappUrl` e o `slug` so estao disponiveis no GET.

---

## Autenticacao

### Base URL

```
https://api.production.talentum.chat
```

### Headers obrigatorios em todas as requests

| Header | Valor | Nota |
|--------|-------|------|
| `Origin` | `https://www.talentum.chat` | CORS — sem ele a API rejeita |
| `Content-Type` | `application/json` | Apenas em POST/PUT |
| `Cookie` | `tl_auth=<jwt>; tl_refresh=<jwt>` | Todas as requests autenticadas |

### Criptografia da Senha (RSA-OAEP SHA-256)

A API **rejeita senha em plaintext** — retorna `400 { "message": { "message": "Invalid encrypted data" } }`.

A senha deve ser criptografada no client antes de enviar:

| Parametro | Valor |
|-----------|-------|
| **Algoritmo** | RSA-OAEP |
| **Hash** | SHA-256 |
| **Formato da chave** | SPKI (DER em base64) |
| **Formato de importacao** | `crypto.subtle.importKey("spki", ...)` no browser, `crypto.publicEncrypt()` no Node |
| **Output** | base64 |

**Chave publica RSA (extraida de `https://www.talentum.chat/assets/index-wtXHVJ0l.js`):**

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtsKAWr0jt+CcSObbas2q
WVY8iooGBorFVC7RqBszOIdX4CCTF5n+KThsyVYpU8CCdhu0JZejAKyqO7ZwF75i
GtTc762ePGifLQhRoknnbZZfuBGuM6WnzmTNsYtV5TTiA+e2GSUt9yjBgtZjcVlG
Q61RCLSN5BuiiWIC4TcLErPluHRF6v40J8CjnZT2rbouZSvT0gygEm2QPWpn5S9a
kKoF0JNTdy1ywAc1bzQyHll7qcLCQLzrNUb6fNatz7aLChAiYtZ8Z6GS4HgSx5UY
jMZuXLNFw5j79I7LdzBx7lt2HT+QFJgvMENOteUsvcm46PkJ5EVzj76kP5fblDx8
3wIDAQAB
```

**Localizacao no bundle:** buscar `importKey("spki"` — a chave e o unico valor base64 longo proximo.

**Implementacao Node.js:**

```typescript
import crypto from 'crypto';

const PUBLIC_KEY_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtsKAWr0jt+CcSObbas2qWVY8iooGBorFVC7RqBszOIdX4CCTF5n+KThsyVYpU8CCdhu0JZejAKyqO7ZwF75iGtTc762ePGifLQhRoknnbZZfuBGuM6WnzmTNsYtV5TTiA+e2GSUt9yjBgtZjcVlGQ61RCLSN5BuiiWIC4TcLErPluHRF6v40J8CjnZT2rbouZSvT0gygEm2QPWpn5S9akKoF0JNTdy1ywAc1bzQyHll7qcLCQLzrNUb6fNatz7aLChAiYtZ8Z6GS4HgSx5UYjMZuXLNFw5j79I7LdzBx7lt2HT+QFJgvMENOteUsvcm46PkJ5EVzj76kP5fblDx83wIDAQAB';

function encryptPassword(plaintext: string): string {
  const pem = `-----BEGIN PUBLIC KEY-----\n${
    PUBLIC_KEY_B64.match(/.{1,64}/g)!.join('\n')
  }\n-----END PUBLIC KEY-----`;

  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(plaintext)
  );
  return encrypted.toString('base64');
}
```

> **ATENCAO:** A chave publica esta hardcoded no bundle JS da Talentum. Se eles fizerem deploy de um novo bundle, a chave pode mudar. Nesse caso, buscar novamente no bundle: `curl -s https://www.talentum.chat/login | grep -oE 'src="[^"]*\.js"'` → baixar o JS → `grep -o 'MII[A-Za-z0-9+/=]\{100,\}'`.

### Token Lifecycle

Apos login bem-sucedido, a API retorna 3 cookies via header `Set-Cookie`:

| Cookie | Descricao | Max-Age | HttpOnly | Secure | SameSite |
|--------|-----------|---------|----------|--------|----------|
| `tl_auth` | JWT de acesso (short-lived) | 10800s (~3h) | Sim | Sim | None |
| `tl_refresh` | JWT de refresh (long-lived) | 604800s (~7d) | Sim | Sim | None |
| `tl_prefs` | Preferencias do usuario (idioma/tema) | 31536000s (~1 ano) | Nao | Sim | None |

**Estrutura do JWT `tl_auth` (decodificado):**
```json
{
  "sub": "6908bf6e89968fb32c56c741",
  "sid": "70cac339-3d18-45fd-b092-9e80e42520b8",
  "iat": 1775169099,
  "exp": 1775179899
}
```

| Campo | Descricao |
|-------|-----------|
| `sub` | User ID (MongoDB ObjectId) — fixo para a conta `enlite@enlite.health` |
| `sid` | Session ID (UUID) — muda a cada login |
| `iat` | Issued at (Unix timestamp) |
| `exp` | Expires at (Unix timestamp) — `iat + 10800` (~3h) |

**Estrutura do JWT `tl_refresh` (decodificado):**
```json
{
  "sub": "6908bf6e89968fb32c56c741",
  "sid": "70cac339-3d18-45fd-b092-9e80e42520b8",
  "iat": 1775169099,
  "exp": 1775773899
}
```

Mesma estrutura, mas `exp = iat + 604800` (~7 dias).

### Credenciais Enlite

Armazenadas no **GCP Secret Manager** (projeto `enlite-prd`):

| Secret | Valor |
|--------|-------|
| `talentum-api-email` | `enlite@enlite.health` |
| `talentum-api-password` | Senha plaintext (criptografada em runtime com RSA antes de enviar) |

### Estrategia de Renovacao

O `tl_auth` expira em ~3h. Opcoes:

- **Login on-demand (recomendado):** Fazer login antes de cada operacao. Criacao de prescreening e evento raro (1-2x/dia), latencia do login extra e aceitavel (~200ms).
- **Cache com re-login:** Cachear `tl_auth` em memoria, re-logar se `Date.now() > expiresAt - margem`. Mais complexo sem beneficio real.
- **Refresh token:** Nao investigamos se existe endpoint de refresh. O login e simples o suficiente.

---

## Endpoints

### 1. POST /auth/login

Autentica o usuario. Retorna tokens **exclusivamente via Set-Cookie headers** — o body da resposta e vazio.

**cURL:**
```bash
curl -s -D - 'https://api.production.talentum.chat/auth/login' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.talentum.chat' \
  --data-raw '{
    "email": "enlite@enlite.health",
    "password": "<RSA-OAEP encrypted base64>"
  }'
```

**Request body:**

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| `email` | string | Sim | Email da conta Talentum |
| `password` | string | Sim | Senha criptografada com RSA-OAEP SHA-256, em base64 |

**Response headers (sucesso — 200 OK):**
```http
HTTP/2 200
content-length: 0
access-control-allow-origin: https://www.talentum.chat
access-control-allow-credentials: true
access-control-allow-headers: content-type,Authorization,x-isobserver-user
access-control-allow-methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
set-cookie: tl_auth=eyJhbG...; Path=/; Expires=...; Max-Age=10800; HttpOnly; Secure; SameSite=None
set-cookie: tl_refresh=eyJhbG...; Path=/; Expires=...; Max-Age=604800; HttpOnly; Secure; SameSite=None
set-cookie: tl_prefs=language-spanish_theme-light; Max-Age=31536000; Path=/; Expires=...; Secure; SameSite=None
x-powered-by: Express
```

**Response body:** Vazio (`content-length: 0`)

**Erros conhecidos:**

| Status | Body | Causa |
|--------|------|-------|
| `400` | `{"statusCode":400,"message":{"message":"Invalid encrypted data","error":"Bad Request","statusCode":400}}` | Senha em plaintext ou criptografia incorreta |
| `401` | `{"statusCode":401,"message":"Unauthorized"}` | Email ou senha incorretos |

**Extracao dos cookies em Node.js:**
```typescript
const res = await fetch('https://api.production.talentum.chat/auth/login', { ... });

const cookies = res.headers.getSetCookie?.() ?? [];
const tlAuth = cookies.find(c => c.startsWith('tl_auth='))?.split(';')[0]?.split('=')[1];
const tlRefresh = cookies.find(c => c.startsWith('tl_refresh='))?.split(';')[0]?.split('=')[1];

// Para usar nas proximas requests:
const cookieHeader = `tl_auth=${tlAuth}; tl_refresh=${tlRefresh}`;
```

---

### 2. GET /users/me

Retorna dados do usuario autenticado. Util para validar que o login funcionou e obter o `_id` do usuario.

**cURL:**
```bash
curl -s 'https://api.production.talentum.chat/users/me' \
  -H 'origin: https://www.talentum.chat' \
  -H 'Cookie: tl_auth=<jwt>; tl_refresh=<jwt>'
```

**Response completa (200 OK):**
```json
{
  "_id": "6908bf6e89968fb32c56c741",
  "email": "enlite@enlite.health",
  "firstName": "admin",
  "lastName": "enlite",
  "company": "enlite",
  "language": "spanish",
  "theme": "light",
  "integrations": {},
  "permissions": {
    "integrations": true,
    "search": true
  },
  "onboardingFlowState": {
    "initial": false,
    "campaigns": false,
    "ats": false,
    "preescreening": false
  },
  "companyConfig": {
    "prescreening": {
      "commented": false
    },
    "ats": {
      "commented": false
    }
  }
}
```

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `_id` | string | MongoDB ObjectId — ID do usuario na Talentum |
| `email` | string | Email da conta |
| `firstName` | string | Nome |
| `lastName` | string | Sobrenome |
| `company` | string | Slug da empresa |
| `language` | string | Idioma: `"spanish"`, `"english"`, `"portuguese"` |
| `theme` | string | `"light"` ou `"dark"` |
| `integrations` | object | Integracoes ativas (vazio para Enlite) |
| `permissions` | object | Permissoes: `integrations`, `search` |
| `onboardingFlowState` | object | Etapas do onboarding ja concluidas |
| `companyConfig` | object | Config da empresa: `prescreening.commented`, `ats.commented` |

---

### 3. POST /pre-screening/projects

Cria um novo projeto de Pre-Screening. Vincula uma vaga a um bot de triagem via WhatsApp.

**cURL:**
```bash
curl -s 'https://api.production.talentum.chat/pre-screening/projects' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.talentum.chat' \
  -H 'Cookie: tl_auth=<jwt>; tl_refresh=<jwt>' \
  --data-raw '{
    "askForCv": false,
    "cvRequired": false,
    "linkedinRequired": false,
    "title": "CASO 747",
    "description": "Descripcion de la Propuesta:\nSe busca un profesional...",
    "questions": [
      {
        "question": "Cual es tu experiencia con pacientes TEA?",
        "type": "text",
        "responseType": ["text", "audio"],
        "desiredResponse": "Experiencia minima de 6 meses con pacientes TEA",
        "weight": 8,
        "required": false,
        "analyzed": true,
        "earlyStoppage": false
      },
      {
        "question": "Disponibilidad horaria?",
        "type": "text",
        "responseType": ["text", "audio"],
        "desiredResponse": "Lunes a viernes de 8 a 16hs",
        "weight": 10,
        "required": true,
        "analyzed": true,
        "earlyStoppage": false
      }
    ],
    "type": "WHATSAPP",
    "faq": [
      {
        "question": "Cual es el salario?",
        "answer": "El salario se define en la entrevista segun experiencia"
      }
    ]
  }'
```

**Response (201 Created):**
```json
{
  "projectId": "69ceefa8c0697b041fcb7753",
  "publicId": "1b32ab57-3231-4148-8746-638e07b56ca7"
}
```

> **IMPORTANTE:** A response do POST **nao inclui** `whatsappUrl` nem `slug`. E necessario fazer um GET `/pre-screening/projects/:projectId` em seguida para obter esses campos.

#### Campos do request body

| Campo | Tipo | Obrigatorio | Default | Descricao |
|-------|------|-------------|---------|-----------|
| `title` | string | Sim | — | Titulo do prescreening (ex: "CASO 747") |
| `description` | string | Sim | — | Descricao completa da vaga (texto formatado com secoes) |
| `type` | enum | Sim | — | Canal do bot. Unico valor observado: `"WHATSAPP"` |
| `questions` | array | Sim (min 1) | — | Perguntas do prescreening |
| `faq` | array | Nao | `[]` | Perguntas frequentes (bot responde automaticamente) |
| `askForCv` | boolean | Sim | — | Pedir CV ao candidato |
| `cvRequired` | boolean | Sim | — | CV e obrigatorio (so vale se `askForCv: true`) |
| `linkedinRequired` | boolean | Sim | — | Perfil LinkedIn obrigatorio |

#### Campos de cada `questions[]`

| Campo | Tipo | Obrigatorio | Default | Descricao |
|-------|------|-------------|---------|-----------|
| `question` | string | Sim | — | Texto da pergunta feita pelo bot ao candidato |
| `type` | string | Sim | — | Tipo de pergunta. Unico valor observado: `"text"` |
| `responseType` | string[] | Sim | — | Formatos aceitos: `["text"]`, `["audio"]`, `["text", "audio"]` |
| `desiredResponse` | string | Sim | — | Resposta esperada — a IA da Talentum compara a resposta do candidato contra este texto |
| `weight` | number | Sim | — | Peso da pergunta na avaliacao (1-10). Labels na UI: 1-3 "Baja importancia", 4-6 "Media importancia", 7-9 "Alta importancia", 10 "Alta importancia (Requerida)" |
| `required` | boolean | Sim | — | Se `true`, pergunta deve ser respondida corretamente para qualificar |
| `analyzed` | boolean | Sim | — | Se `true`, IA da Talentum avalia a resposta contra `desiredResponse`. Se `false`, resposta e apenas registrada |
| `earlyStoppage` | boolean | Sim | — | Se `true`, bot interrompe prescreening imediatamente se candidato responder incorretamente |

#### Campos de cada `faq[]`

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| `question` | string | Sim | Pergunta frequente que o candidato pode fazer |
| `answer` | string | Sim | Resposta automatica do bot |

#### Response fields

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `projectId` | string | ID interno da Talentum (MongoDB ObjectId, 24 chars hex) |
| `publicId` | string | UUID publico do projeto |

---

### 4. GET /pre-screening/projects

Lista todos os projetos de prescreening da conta.

**cURL:**
```bash
curl -s 'https://api.production.talentum.chat/pre-screening/projects' \
  -H 'origin: https://www.talentum.chat' \
  -H 'Cookie: tl_auth=<jwt>; tl_refresh=<jwt>'
```

**Response completa (200 OK):**
```json
{
  "projects": [
    {
      "projectId": "69ca582c5663dfcd96613424",
      "title": "CASO 747",
      "description": "Descripción de la Propuesta:\nSe busca un profesional para una prestación de servicios destinada a un paciente adulto de 29 años con diagnóstico de bipolaridad en la zona de Recoleta, CABA. El objetivo principal es brindar acompañamiento terapéutico domiciliario para favorecer su estabilidad y autonomía. Los turnos disponibles son de lunes a viernes, de 17:00 a 23:00.\n\nPerfil Profesional Sugerido:\nBuscamos un Acompañante Terapéutico de sexo masculino (excluyente) que cuente con formación sólida y experiencia acreditable en el trabajo con adultos que presentan trastornos del espectro bipolar. Es fundamental contar con herramientas para el manejo de la patología y capacidad de sostener el encuadre clínico.\n\nEl Marco de Acompañamiento:\nEnLite Health Solutions ofrece a los prestadores un marco de trabajo profesional y organizado, donde cada acompañamiento o cuidado se realiza dentro de un proyecto terapéutico claro, con supervisión clínica y soporte continuo del equipo de Coordinación Clínica formado por psicólogas. Nuestra propuesta de valor es brindarles casos acordes a su perfil y formación, con respaldo administrativo y clínico, para que puedan enfocarse en lo más importante: el bienestar del paciente.",
      "timestamp": "2026-03-30T11:02:04.285Z",
      "publicId": "7bec6fc9-ae3b-404c-8e4f-6951814a4016",
      "questions": [
        {
          "questionId": "0f2cbc39-7d66-4244-85ec-87aece34ea52",
          "question": "Teniendo en cuenta que el perfil solicitado es masculino, ¿cumplís con este requisito?",
          "type": "text",
          "responseType": ["text", "audio"],
          "required": false,
          "analyzed": true,
          "earlyStoppage": false,
          "desiredResponse": "Apto: Sí. No Apto: No",
          "validation": "",
          "weight": 10,
          "options": []
        },
        {
          "questionId": "952adeca-397b-480f-9509-0a7fa4cf2465",
          "question": "¿Qué tan cerca te encontrás de la zona de Recoleta (Arenales 2100 APROX) y cómo calificarías tu facilidad de movilidad para cumplir el horario de 17 a 23h?",
          "type": "text",
          "responseType": ["text", "audio"],
          "required": false,
          "analyzed": true,
          "earlyStoppage": false,
          "desiredResponse": "Apto: Reside cerca o tiene fácil acceso. Aceptable: Reside en zonas aledañas con transporte directo. No Apto: Distancia excesiva.",
          "validation": "",
          "weight": 8,
          "options": []
        }
      ],
      "active": true,
      "cvRequired": false,
      "askForCv": false,
      "type": "WHATSAPP",
      "linkedinRequired": false,
      "faq": [],
      "slug": "abc123def",
      "whatsappUrl": "https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posici%C3%B3n%20de%20CASO%20747.%0ARef%3A%20%23abc123def",
      "responseType": ["text", "audio"],
      "createdBy": {
        "userId": "6908bf6e89968fb32c56c741",
        "firstName": "admin",
        "lastName": "enlite"
      }
    }
  ],
  "count": 5
}
```

| Campo raiz | Tipo | Descricao |
|------------|------|-----------|
| `projects` | array | Lista de projetos |
| `count` | number | Total de projetos |

Cada projeto no array tem a mesma estrutura do GET individual (secao 5 abaixo).

---

### 5. GET /pre-screening/projects/:projectId

Retorna detalhes completos de um projeto especifico, incluindo o `whatsappUrl`.

**cURL:**
```bash
curl -s 'https://api.production.talentum.chat/pre-screening/projects/69cef290c0697b041fcb77ca' \
  -H 'origin: https://www.talentum.chat' \
  -H 'Cookie: tl_auth=<jwt>; tl_refresh=<jwt>'
```

**Response completa (200 OK):**
```json
{
  "projectId": "69cef290c0697b041fcb77ca",
  "title": "[TEST-AUTO] AT Zona Sur - Enlite API Test",
  "description": "Test automatico da API Enlite. Favor ignorar.",
  "timestamp": "2026-04-02T22:49:52.907Z",
  "publicId": "5273aff5-66f0-4b31-a36c-c29e5b391597",
  "questions": [
    {
      "questionId": "a6d9e2fb-e7d8-477b-bc0f-3eb96cab1ae7",
      "question": "Cual es tu experiencia con pacientes TEA?",
      "type": "text",
      "responseType": ["text", "audio"],
      "required": false,
      "analyzed": true,
      "earlyStoppage": false,
      "desiredResponse": "Experiencia minima de 6 meses",
      "validation": "",
      "weight": 8,
      "options": []
    }
  ],
  "active": true,
  "cvRequired": false,
  "askForCv": false,
  "type": "WHATSAPP",
  "linkedinRequired": false,
  "faq": [],
  "slug": "u8m1outjd5",
  "whatsappUrl": "https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posici%C3%B3n%20de%20%5BTEST-AUTO%5D%20AT%20Zona%20Sur%20-%20Enlite%20API%20Test.%0ARef%3A%20%23u8m1outjd5",
  "responseType": ["text", "audio"],
  "createdBy": {
    "userId": "6908bf6e89968fb32c56c741",
    "firstName": "admin",
    "lastName": "enlite"
  }
}
```

#### Campos do response (todos os campos do projeto)

| Campo | Tipo | Presente no POST? | Descricao |
|-------|------|-------------------|-----------|
| `projectId` | string | Sim (response) | MongoDB ObjectId (24 hex chars) |
| `publicId` | string (UUID) | Sim (response) | UUID publico |
| `title` | string | Sim (request) | Titulo do prescreening |
| `description` | string | Sim (request) | Descricao completa |
| `timestamp` | string (ISO 8601) | Nao | Data/hora de criacao |
| `questions` | array | Sim (request) | Perguntas com `questionId` adicionado pela Talentum |
| `active` | boolean | Nao | Se o prescreening esta ativo (aceita respostas) |
| `cvRequired` | boolean | Sim (request) | CV obrigatorio |
| `askForCv` | boolean | Sim (request) | Pedir CV |
| `type` | string | Sim (request) | `"WHATSAPP"` |
| `linkedinRequired` | boolean | Sim (request) | LinkedIn obrigatorio |
| `faq` | array | Sim (request) | FAQs |
| `slug` | string | **Nao** | Identificador curto gerado pela Talentum (ex: `u8m1outjd5`) |
| `whatsappUrl` | string | **Nao** | Link completo do bot WhatsApp (pronto para compartilhar) |
| `responseType` | string[] | Nao | Agregado dos `responseType` de todas as perguntas |
| `createdBy` | object | Nao | Usuario que criou: `{ userId, firstName, lastName }` |

#### Campos adicionais em `questions[]` (retornados, nao enviados)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `questionId` | string (UUID) | ID unico da pergunta, gerado pela Talentum. Este e o ID usado nos webhooks de resposta |
| `validation` | string | Validacao customizada (vazio na maioria dos casos) |
| `options` | array | Opcoes de multipla escolha (vazio para perguntas tipo `text`) |

---

### 6. DELETE /pre-screening/projects/:projectId

Deleta permanentemente um projeto de prescreening. Candidatos nao poderao mais responder.

**cURL:**
```bash
curl -s -X DELETE 'https://api.production.talentum.chat/pre-screening/projects/69cef290c0697b041fcb77ca' \
  -H 'origin: https://www.talentum.chat' \
  -H 'Cookie: tl_auth=<jwt>; tl_refresh=<jwt>'
```

**Response:** `200 OK` (body vazio)

**Notas:**
- DELETE de projeto que nao existe retorna 200 (idempotente, nao testado mas provavel)
- Testamos delete de projeto recem-criado — funcionou imediatamente
- Nao ha endpoint de "desativar" (soft-delete) — apenas delete permanente

---

## Link do Bot WhatsApp

O link e gerado automaticamente pela Talentum no momento da criacao e retornado nos endpoints GET.

### Formato

```
https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posici%C3%B3n%20de%20{title_encoded}.%0ARef%3A%20%23{slug}
```

### Componentes

| Componente | Valor | Descricao |
|------------|-------|-----------|
| Numero WhatsApp | `+54 9 11 2722-7852` | Numero fixo do bot da Talentum |
| `{title_encoded}` | URL-encoded | Titulo do prescreening |
| `{slug}` | ex: `u8m1outjd5` | Identificador curto, precedido de `#` |

### Texto que o candidato ve ao clicar o link

```
Hola! Estoy interesado en la posición de [TITULO DA VAGA].
Ref: #[SLUG]
```

O bot da Talentum identifica o prescreening pelo `#slug` e inicia a conversa.

---

## Mapeamento Enlite ↔ Talentum

### Campos de criacao (Enlite → Talentum POST)

| Dado Enlite | Campo Talentum | Transformacao |
|-------------|----------------|---------------|
| `job_postings.title` | `title` | Direto (ex: "CASO 747") |
| Texto gerado pelo Groq | `description` | LLM gera a partir de `worker_profile_sought` + dados do paciente |
| `job_posting_prescreening_questions.*` | `questions[]` | Mapeamento 1:1 dos campos |
| `job_posting_prescreening_faq.*` | `faq[]` | Mapeamento 1:1 |
| Fixo | `type` | Sempre `"WHATSAPP"` |
| Fixo | `askForCv` | `false` (padrao Enlite) |
| Fixo | `cvRequired` | `false` |
| Fixo | `linkedinRequired` | `false` |

### Campos de retorno (Talentum → Enlite banco)

| Campo Talentum | Coluna Enlite (job_postings) | Descricao |
|----------------|------------------------------|-----------|
| `projectId` | `talentum_project_id` (VARCHAR 50) | ID interno Talentum |
| `publicId` | `talentum_public_id` (UUID) | UUID publico |
| `whatsappUrl` | `talentum_whatsapp_url` (TEXT) | Link do bot pronto |
| `slug` | `talentum_slug` (VARCHAR 20) | Identificador curto |
| (timestamp) | `talentum_published_at` (TIMESTAMPTZ) | Quando foi publicado |
| Texto Groq | `talentum_description` (TEXT) | Descricao gerada pelo LLM |

### Formato da descricao (3 secoes obrigatorias)

A descricao enviada para a Talentum deve ter este formato (observado em todos os projetos existentes):

```
Descripción de la Propuesta:
Se busca un profesional para una prestación de servicios destinada a
[dados do caso sem informacao sensivel]...

Perfil Profesional Sugerido:
Buscamos [tipo de profissional] que cuente con [requisitos]...

El Marco de Acompañamiento:
EnLite Health Solutions ofrece a los prestadores un marco de trabajo
profesional y organizado, donde cada acompañamiento o cuidado se realiza
dentro de un proyecto terapéutico claro, con supervisión clínica y
soporte continuo del equipo de Coordinación Clínica formado por
psicólogas. Nuestra propuesta de valor es brindarles casos acordes a su
perfil y formación, con respaldo administrativo y clínico, para que
puedan enfocarse en lo más importante: el bienestar del paciente.
```

> A 3a secao ("El Marco de Acompanamiento") e **sempre o mesmo texto** em todas as vagas.

---

## Testes Realizados (2026-04-02)

Todos os testes foram feitos em **producao** (`api.production.talentum.chat`), conta `enlite@enlite.health`.

| # | Teste | Metodo | Status | Resultado |
|---|-------|--------|--------|-----------|
| 1 | Login com senha plaintext | POST /auth/login | `400` | `"Invalid encrypted data"` — API rejeita plaintext |
| 2 | Login com RSA-OAEP SHA-256 | POST /auth/login | `200` | Tokens retornados via Set-Cookie (3 cookies) |
| 3 | Validar sessao | GET /users/me | `200` | Dados completos do usuario retornados |
| 4 | Criar prescreening | POST /pre-screening/projects | `201` | `{ projectId: "69cef290c0697b041fcb77ca", publicId: "5273aff5-..." }` |
| 5 | Buscar prescreening criado | GET /pre-screening/projects/:id | `200` | Dados completos incluindo `whatsappUrl` e `slug` |
| 6 | Listar todos os prescreenings | GET /pre-screening/projects | `200` | `{ projects: [...], count: N }` — retorna todos incluindo questions |
| 7 | Deletar prescreening de teste | DELETE /pre-screening/projects/:id | `200` | Body vazio, projeto removido |

### Projeto de teste criado e deletado

```
Title:     [TEST-AUTO] AT Zona Sur - Enlite API Test
ProjectId: 69cef290c0697b041fcb77ca
PublicId:  5273aff5-66f0-4b31-a36c-c29e5b391597
Slug:      u8m1outjd5
WhatsApp:  https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posici%C3%B3n%20de%20%5BTEST-AUTO%5D%20AT%20Zona%20Sur%20-%20Enlite%20API%20Test.%0ARef%3A%20%23u8m1outjd5
Status:    DELETADO apos teste
```

### Dados da chave publica

| Propriedade | Valor |
|-------------|-------|
| Fonte | `https://www.talentum.chat/assets/index-wtXHVJ0l.js` |
| Contexto no bundle | `importKey("spki",i,{name:"RSA-OAEP",hash:"SHA-256"},!1,["encrypt"])` |
| Formato | SPKI DER em base64 |
| Tamanho da chave | 2048 bits (RSA) |
| Output criptografado | 344 chars base64 (~256 bytes) |

---

## Endpoints NAO Investigados

Estes endpoints provavelmente existem mas nao foram testados:

| Endpoint | Hipotese | Prioridade |
|----------|----------|------------|
| `PUT /pre-screening/projects/:id` | Editar projeto existente | Media — util para atualizar perguntas sem recriar |
| `PATCH /pre-screening/projects/:id` | Ativar/desativar projeto | Baixa |
| `POST /auth/refresh` | Renovar token sem re-login | Baixa — login on-demand e suficiente |
| `GET /pre-screening/projects/:id/responses` | Listar respostas dos candidatos | Baixa — ja recebemos via webhook |
| `GET /pre-screening/projects/:id/stats` | Estatisticas do prescreening | Baixa |
