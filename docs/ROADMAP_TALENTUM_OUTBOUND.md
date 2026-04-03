# Roadmap — Publicacao Automatica de Vagas na Talentum

> Permitir que o admin crie/edite vagas no painel Enlite, configure perguntas de prescreening, e publique diretamente na Talentum.chat com um switch. O Groq gera o texto formatado da descricao automaticamente.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Backend: TalentumApiClient (servico encapsulado) | DONE |
| **Step 2** | Backend: Migration (colunas Talentum + tabela de perguntas) | DONE |
| **Step 3** | Backend: TalentumDescriptionService (Groq gera texto formatado) | DONE |
| **Step 4** | Backend: PublishVacancyToTalentum use case + endpoint | DONE |
| **Step 5** | Frontend: Formulario de criar/editar vaga | PENDENTE |
| **Step 6** | Frontend: Configuracao de prescreening (perguntas + FAQ) | PENDENTE |
| **Step 7** | Frontend: Switch "Publicar en Talentum" + exibir whatsappUrl | PENDENTE |
| **Step 8** | QA: Validacao completa | PENDENTE |

---

## Contexto

### Fluxo manual atual (recrutadoras)
```
1. Coordenadora passa dados do caso
2. Recrutadora cola no GEM (Google Gemini) com template
3. GEM gera texto formatado (Secao A + B + C)
4. Recrutadora copia Secao B para planilha
5. Corrige manualmente se necessario
6. Importa no WordPress e cria prescreening manualmente na Talentum
```

### Fluxo automatizado (objetivo)
```
1. Admin cria/edita vaga no painel Enlite (campos basicos)
2. Groq gera automaticamente o texto formatado (descricao + perfil + marco)
3. Admin configura perguntas de prescreening por vaga
4. Admin ativa switch "Publicar en Talentum"
5. Backend chama API Talentum → cria prescreening → salva whatsappUrl
6. Admin compartilha link do bot com candidatos
7. Candidato faz prescreening no WhatsApp → webhook retorna resultados (fluxo existente)
```

### Documentacao de referencia
- API Talentum: `docs/TALENTUM_OUTBOUND_API.md`
- Gestao de vagas: `docs/features/vacancy-management.md`
- Webhooks inbound: `docs/features/webhooks-integrations.md`

---

## Step 1 — Backend: TalentumApiClient (servico encapsulado)

**Objetivo:** Criar um client reutilizavel que encapsula toda comunicacao com a API Talentum (login RSA-OAEP, CRUD de prescreenings).

### O que existe hoje
- Nao existe client outbound para Talentum. A integracao atual e inbound (webhooks).
- Groq ja esta integrado via `JobPostingEnrichmentService.ts` — padrao de servico externo.
- Credenciais podem ser lidas via `SecretManagerServiceClient` do GCP (ja usado no projeto).

### O que criar

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumApiClient.ts`

```typescript
import crypto from 'crypto';

interface TalentumAuth {
  tlAuth: string;
  tlRefresh: string;
  expiresAt: number; // Date.now() + TTL
}

interface TalentumQuestion {
  question: string;
  type: 'text';
  responseType: ('text' | 'audio')[];
  desiredResponse: string;
  weight: number;       // 1-10
  required: boolean;
  analyzed: boolean;
  earlyStoppage: boolean;
}

interface TalentumFaq {
  question: string;
  answer: string;
}

interface CreatePrescreeningInput {
  title: string;
  description: string;
  questions: TalentumQuestion[];
  faq?: TalentumFaq[];
  askForCv?: boolean;
  cvRequired?: boolean;
  linkedinRequired?: boolean;
}

interface CreatePrescreeningResult {
  projectId: string;
  publicId: string;
}

interface TalentumProject {
  projectId: string;
  publicId: string;
  title: string;
  description: string;
  whatsappUrl: string;
  slug: string;
  active: boolean;
  timestamp: string;
  questions: Array<TalentumQuestion & { questionId: string }>;
  faq: TalentumFaq[];
}

export class TalentumApiClient {
  private static readonly BASE_URL = 'https://api.production.talentum.chat';
  private static readonly ORIGIN = 'https://www.talentum.chat';
  private static readonly RSA_PUBLIC_KEY_B64 = '...'; // chave completa

  private email: string;
  private password: string;
  private auth: TalentumAuth | null = null;

  constructor(email: string, password: string) { ... }

  // Factory que le credenciais do Secret Manager
  static async fromSecretManager(): Promise<TalentumApiClient> { ... }

  // Login: criptografa senha com RSA-OAEP SHA-256, extrai cookies do Set-Cookie
  private async login(): Promise<void> { ... }

  // Garante auth valido (re-login se expirado)
  private async ensureAuth(): Promise<string> { ... }

  // CRUD
  async createPrescreening(input: CreatePrescreeningInput): Promise<CreatePrescreeningResult> { ... }
  async getPrescreening(projectId: string): Promise<TalentumProject> { ... }
  async deletePrescreening(projectId: string): Promise<void> { ... }
  async listPrescreenings(): Promise<{ projects: TalentumProject[]; count: number }> { ... }
}
```

### Detalhes de implementacao

**Login (RSA-OAEP):**
```typescript
private encryptPassword(plaintext: string): string {
  const pem = `-----BEGIN PUBLIC KEY-----\n${
    TalentumApiClient.RSA_PUBLIC_KEY_B64.match(/.{1,64}/g)!.join('\n')
  }\n-----END PUBLIC KEY-----`;

  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(plaintext)
  );
  return encrypted.toString('base64');
}

private async login(): Promise<void> {
  const res = await fetch(`${TalentumApiClient.BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': TalentumApiClient.ORIGIN },
    body: JSON.stringify({ email: this.email, password: this.encryptPassword(this.password) }),
  });

  if (!res.ok) throw new Error(`Talentum login failed: ${res.status}`);

  const cookies = res.headers.getSetCookie?.() ?? [];
  const tlAuth = cookies.find(c => c.startsWith('tl_auth='))?.split(';')[0]?.split('=')[1];
  const tlRefresh = cookies.find(c => c.startsWith('tl_refresh='))?.split(';')[0]?.split('=')[1];

  if (!tlAuth || !tlRefresh) throw new Error('Talentum login: missing cookies');

  this.auth = { tlAuth, tlRefresh, expiresAt: Date.now() + 10_000 * 1000 }; // ~2.7h (margem)
}
```

**Secret Manager factory:**
```typescript
static async fromSecretManager(): Promise<TalentumApiClient> {
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
  const client = new SecretManagerServiceClient();
  const projectId = process.env.GCP_PROJECT_ID ?? 'enlite-prd';

  const [emailRes] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/talentum-api-email/versions/latest` });
  const [passRes] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/talentum-api-password/versions/latest` });

  const email = emailRes.payload?.data?.toString() ?? '';
  const password = passRes.payload?.data?.toString() ?? '';

  return new TalentumApiClient(email, password);
}
```

### Criterios de aceite

- CA-1.1: `TalentumApiClient.fromSecretManager()` le credenciais do GCP Secret Manager
- CA-1.2: Login criptografa senha com RSA-OAEP SHA-256 e extrai cookies do `Set-Cookie`
- CA-1.3: `ensureAuth()` faz re-login automatico quando token expira (~2.7h margem)
- CA-1.4: `createPrescreening()` retorna `{ projectId, publicId }`
- CA-1.5: `getPrescreening()` retorna dados completos incluindo `whatsappUrl`
- CA-1.6: `deletePrescreening()` remove o projeto
- CA-1.7: Erros HTTP da Talentum sao propagados com contexto (status + body)
- CA-1.8: Em ambiente local/test, aceita email/password via env vars (sem Secret Manager)
- CA-1.9: Arquivo nao ultrapassa 400 linhas

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `worker-functions/src/infrastructure/services/TalentumApiClient.ts` | CRIAR |
| `worker-functions/src/domain/interfaces/ITalentumApiClient.ts` | CRIAR (interface para DI) |

---

## Step 2 — Backend: Migration

**Objetivo:** Adicionar colunas na tabela `job_postings` para referencia Talentum e criar tabela para perguntas de prescreening configuraveis por vaga.

### Novas colunas em `job_postings`

```sql
-- Migration: XXX_add_talentum_fields_to_job_postings.sql

ALTER TABLE job_postings
  ADD COLUMN talentum_project_id VARCHAR(50),
  ADD COLUMN talentum_public_id UUID,
  ADD COLUMN talentum_whatsapp_url TEXT,
  ADD COLUMN talentum_slug VARCHAR(20),
  ADD COLUMN talentum_published_at TIMESTAMPTZ,
  ADD COLUMN talentum_description TEXT;  -- texto formatado gerado pelo Groq

CREATE UNIQUE INDEX idx_job_postings_talentum_project_id
  ON job_postings (talentum_project_id) WHERE talentum_project_id IS NOT NULL;
```

### Nova tabela: `job_posting_prescreening_questions`

```sql
CREATE TABLE job_posting_prescreening_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  question_order SMALLINT NOT NULL,

  -- Campos que mapeiam 1:1 com a API Talentum
  question TEXT NOT NULL,
  response_type TEXT[] NOT NULL DEFAULT '{text,audio}',  -- text, audio
  desired_response TEXT NOT NULL,
  weight SMALLINT NOT NULL CHECK (weight BETWEEN 1 AND 10),
  required BOOLEAN NOT NULL DEFAULT false,
  analyzed BOOLEAN NOT NULL DEFAULT true,
  early_stoppage BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_posting_id, question_order)
);

CREATE INDEX idx_prescreening_questions_job_posting
  ON job_posting_prescreening_questions (job_posting_id);
```

### Nova tabela: `job_posting_prescreening_faq`

```sql
CREATE TABLE job_posting_prescreening_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  faq_order SMALLINT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_posting_id, faq_order)
);
```

### Criterios de aceite

- CA-2.1: Migration roda sem erro em banco limpo e em banco existente
- CA-2.2: Colunas Talentum sao nullable (vaga pode existir sem publicacao)
- CA-2.3: Indice unico em `talentum_project_id` previne duplicatas
- CA-2.4: CASCADE em `job_posting_prescreening_questions` — deletar vaga deleta perguntas
- CA-2.5: `question_order` garante ordem deterministica das perguntas

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `worker-functions/migrations/XXX_add_talentum_outbound.sql` | CRIAR |

---

## Step 3 — Backend: TalentumDescriptionService (Groq)

**Objetivo:** Usar o Groq (Llama 3.3 70B) para gerar automaticamente o texto formatado da descricao da vaga no estilo que a Talentum espera, a partir dos dados estruturados da vaga.

### O que existe hoje
- `JobPostingEnrichmentService.ts` — ja usa Groq para extrair campos estruturados de texto livre
- Padrao: system prompt em espanhol + JSON response + temperature 0.1

### O que criar

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumDescriptionService.ts`

**Input (dados da vaga):**
```typescript
interface GenerateDescriptionInput {
  caseNumber: string;
  title: string;
  workerProfileSought: string;   // texto livre do coordenador
  scheduleDaysHours: string;     // texto livre do coordenador
  // Dados do paciente (join)
  patientAge?: number;
  patientDiagnosis?: string;
  patientDependencyLevel?: string;
  patientCity?: string;
  patientState?: string;
  // Dados enriquecidos pelo LLM
  llmRequiredSex?: string;
  llmRequiredProfession?: string[];
}
```

**Output:**
```typescript
interface GeneratedDescription {
  title: string;        // "CASO 747" ou titulo da vaga
  description: string;  // Texto completo com 3 secoes
}
```

**Prompt do Groq (system):**
```
Sos un especialista en redaccion de propuestas de prestacion de servicios
terapeuticos para EnLite Health Solutions.

Tu tarea es generar el texto de descripcion de una vacante para publicar
en la plataforma Talentum. El texto debe tener EXACTAMENTE estas 3 secciones:

1. "Descripcion de la Propuesta:" — Resumen objetivo del caso sin datos
   sensibles del paciente. Incluir: tipo de profesional buscado, zona,
   horarios, objetivo del acompanamiento.

2. "Perfil Profesional Sugerido:" — Descripcion del perfil ideal.
   Incluir: sexo (si excluyente), formacion, experiencia requerida,
   habilidades especificas.

3. "El Marco de Acompanamiento:" — SIEMPRE usar este texto fijo:
   "EnLite Health Solutions ofrece a los prestadores un marco de trabajo
   profesional y organizado, donde cada acompanamiento o cuidado se
   realiza dentro de un proyecto terapeutico claro, con supervision
   clinica y soporte continuo del equipo de Coordinacion Clinica
   formado por psicologas. Nuestra propuesta de valor es brindarles
   casos acordes a su perfil y formacion, con respaldo administrativo
   y clinico, para que puedan enfocarse en lo mas importante: el
   bienestar del paciente."

Reglas:
- NUNCA incluir nombre del paciente, datos de contacto o ID interno
- NUNCA inventar datos que no estan en el input
- Usar espanol argentino profesional
- Ser conciso pero completo (max 300 palabras total)
- Retornar SOLO el texto, sin markdown, sin titulos extras
```

**Prompt do Groq (user):**
```
Datos de la vacante:
- Caso: {caseNumber}
- Perfil buscado: {workerProfileSought}
- Horarios: {scheduleDaysHours}
- Zona: {patientCity}, {patientState}
- Diagnostico: {patientDiagnosis}
- Edad paciente: {patientAge} anos
- Nivel de dependencia: {patientDependencyLevel}
- Sexo requerido: {llmRequiredSex}
- Profesion: {llmRequiredProfession}
```

### Criterios de aceite

- CA-3.1: Servico recebe dados estruturados e retorna texto formatado com 3 secoes
- CA-3.2: Secao 3 ("El Marco de Acompanamiento") e sempre o texto padrao fixo
- CA-3.3: Nenhum dado sensivel do paciente aparece no texto (nome, ID interno, telefone)
- CA-3.4: Usa mesmo Groq API key e modelo da `JobPostingEnrichmentService`
- CA-3.5: Temperature 0.3 (mais criativo que enrichment, mas ainda consistente)
- CA-3.6: Texto gerado e salvo em `job_postings.talentum_description`
- CA-3.7: Admin pode re-gerar a descricao (endpoint separado ou botao)

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `worker-functions/src/infrastructure/services/TalentumDescriptionService.ts` | CRIAR |

---

## Step 4 — Backend: PublishVacancyToTalentum use case + endpoint

**Objetivo:** Orquestrar: gerar descricao via Groq → chamar API Talentum → salvar referencias na vaga.

### Fluxo do use case

```
PublishVacancyToTalentum.execute(jobPostingId)
  1. Buscar vaga + paciente + perguntas de prescreening do banco
  2. Validar: tem perguntas configuradas? tem titulo? tem descricao?
  3. Se nao tem talentum_description → chamar TalentumDescriptionService.generate()
  4. Montar payload: { title, description, questions, faq, type: 'WHATSAPP', ... }
  5. Chamar TalentumApiClient.createPrescreening(payload)
  6. Chamar TalentumApiClient.getPrescreening(projectId) → obter whatsappUrl + slug
  7. Salvar em job_postings: talentum_project_id, talentum_public_id, talentum_whatsapp_url, talentum_slug, talentum_published_at
  8. Retornar { projectId, publicId, whatsappUrl }
```

### Endpoint

```
POST /api/admin/vacancies/:id/publish-talentum
```

**Response (200):**
```json
{
  "projectId": "69ceefa8c0697b041fcb7753",
  "publicId": "1b32ab57-3231-4148-8746-638e07b56ca7",
  "whatsappUrl": "https://wa.me/5491127227852?text=..."
}
```

### Endpoint para re-gerar descricao (sem publicar)

```
POST /api/admin/vacancies/:id/generate-talentum-description
```

**Response (200):**
```json
{
  "description": "Descripcion de la Propuesta:\nSe busca un profesional..."
}
```

### Endpoint para despublicar

```
DELETE /api/admin/vacancies/:id/publish-talentum
```

Chama `TalentumApiClient.deletePrescreening()` e limpa colunas Talentum da vaga.

### Criterios de aceite

- CA-4.1: Publicacao falha se nao ha perguntas de prescreening configuradas (400)
- CA-4.2: Se vaga ja esta publicada (`talentum_project_id != null`), retorna erro (409 Conflict)
- CA-4.3: Descricao e gerada automaticamente se `talentum_description` esta vazio
- CA-4.4: `whatsappUrl` e salvo no banco apos GET do projeto
- CA-4.5: Despublicar chama DELETE na Talentum e limpa colunas
- CA-4.6: Erro na API Talentum retorna 502 com mensagem clara
- CA-4.7: Todas as escritas no banco dentro de transacao

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `worker-functions/src/application/usecases/PublishVacancyToTalentum.ts` | CRIAR |
| `worker-functions/src/interfaces/controllers/VacanciesController.ts` | MODIFICAR — 3 novos endpoints |
| `worker-functions/src/interfaces/routes/` | MODIFICAR — registrar rotas |

---

## Step 5 — Frontend: Formulario de criar/editar vaga

**Objetivo:** Criar modal com formulario React Hook Form + Zod para criar e editar vagas. Hoje o botao "Nueva Vacante" existe mas nao esta conectado a nenhum formulario.

### O que existe hoje
- `AdminVacanciesPage.tsx` — botao "Nueva" (nao wired)
- `VacancyDetailPage.tsx` — exibe dados mas nao permite edicao
- `AdminApiService.createVacancy()` e `updateVacancy()` — ja implementados
- Backend aceita POST e PUT com os campos

### O que criar

**Componente:** `VacancyFormModal.tsx`

**Campos do formulario (tab "Informacion Basica"):**

| Campo | Tipo | Obrigatorio | Mapeamento backend |
|-------|------|-------------|-------------------|
| Numero de Caso | input number | Sim | `case_number` |
| Titulo | input text | Sim | `title` (default: "Caso {case_number}") |
| Paciente | select/combobox | Sim | `patient_id` |
| Perfil buscado | textarea | Sim | `worker_profile_sought` |
| Horarios | textarea | Sim | `schedule_days_hours` |
| Cantidad de prestadores | input number | Sim | `providers_needed` |
| Observaciones | textarea | Nao | `daily_obs` |
| Status | select | Nao (default BUSQUEDA) | `status` |

**Modo edicao:** Mesmos campos, pre-populados com dados da vaga. Endpoint PUT.

### Criterios de aceite

- CA-5.1: Modal abre ao clicar "Nueva Vacante" na lista
- CA-5.2: Modal abre ao clicar botao "Editar" na pagina de detalhe
- CA-5.3: Validacao Zod: `case_number` obrigatorio, `title` min 3 chars, `patient_id` UUID
- CA-5.4: Apos criar, redireciona para detalhe da vaga
- CA-5.5: Apos editar, recarrega dados da vaga
- CA-5.6: i18n em es-AR (todos os labels e mensagens)
- CA-5.7: `pnpm type-check` e `pnpm lint` passam

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyFormModal.tsx` | CRIAR |
| `enlite-frontend/src/presentation/pages/admin/AdminVacanciesPage.tsx` | MODIFICAR — conectar botao |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — botao editar |

---

## Step 6 — Frontend: Configuracao de prescreening (perguntas + FAQ)

**Objetivo:** Na tela de detalhe da vaga, tab/secao para configurar as perguntas de prescreening e FAQ que serao enviadas para a Talentum.

### O que criar

**Componente:** `VacancyPrescreeningConfig.tsx`

**Layout (dentro da pagina de detalhe da vaga, nova secao/card):**

```
┌─────────────────────────────────────────────────────────┐
│ Configuracion Pre-Screening Talentum                    │
│                                                         │
│ [+ Agregar Pregunta]                                    │
│                                                         │
│ ┌─ Pregunta 1 ──────────────────────────────── [🗑] ──┐ │
│ │ Pregunta *:        [textarea                      ] │ │
│ │ Tipo de respuesta: [text ▼] [audio ▼]              │ │
│ │ Respuesta esperada*: [textarea                    ] │ │
│ │ Peso (1-10):       [slider ou input ___]           │ │
│ │                                                     │ │
│ │ ▸ Configuracion avanzada                           │ │
│ │   ☐ Requerida   ☐ Analizada por IA  ☐ Early stop  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ Pregunta 2 ──────────────────────────────── [🗑] ──┐ │
│ │ ...                                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ── Preguntas Frecuentes (FAQ) ──                        │
│ [+ Agregar FAQ]                                         │
│                                                         │
│ ┌─ FAQ 1 ────────────────────────────────── [🗑] ────┐ │
│ │ Pregunta: [input                                  ] │ │
│ │ Respuesta: [textarea                              ] │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│                              [Guardar Configuracion]    │
└─────────────────────────────────────────────────────────┘
```

### Endpoints necessarios no backend

```
GET    /api/admin/vacancies/:id/prescreening-config
POST   /api/admin/vacancies/:id/prescreening-config
```

O GET retorna perguntas + FAQ. O POST faz upsert (replace all).

**Payload do POST:**
```json
{
  "questions": [
    {
      "question": "Cual es tu experiencia con pacientes TEA?",
      "responseType": ["text", "audio"],
      "desiredResponse": "Experiencia minima de 6 meses",
      "weight": 8,
      "required": false,
      "analyzed": true,
      "earlyStoppage": false
    }
  ],
  "faq": [
    {
      "question": "Cual es el salario?",
      "answer": "A convenir segun experiencia"
    }
  ]
}
```

### Criterios de aceite

- CA-6.1: Perguntas podem ser adicionadas, removidas e reordenadas (drag ou setas)
- CA-6.2: Cada pergunta tem validacao: `question` e `desiredResponse` obrigatorios, `weight` 1-10
- CA-6.3: Minimo 1 pergunta para poder publicar na Talentum
- CA-6.4: FAQ e opcional (pode ser vazio)
- CA-6.5: Dados persistem no banco (`job_posting_prescreening_questions` + `_faq`)
- CA-6.6: Se a vaga ja esta publicada na Talentum, exibir aviso "Ya publicada — cambios no se reflejan automaticamente"
- CA-6.7: i18n em es-AR
- CA-6.8: `pnpm type-check` e `pnpm lint` passam

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/VacancyPrescreeningConfig.tsx` | CRIAR |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — adicionar secao |
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | MODIFICAR — novos metodos |
| `worker-functions/src/interfaces/controllers/VacanciesController.ts` | MODIFICAR — 2 endpoints |

---

## Step 7 — Frontend: Switch "Publicar en Talentum" + exibir whatsappUrl

**Objetivo:** Adicionar switch na tela de detalhe da vaga para publicar/despublicar na Talentum. Apos publicacao, exibir o link do bot WhatsApp.

### O que criar

**Componente:** `VacancyTalentumCard.tsx` (novo card na pagina de detalhe)

**Estado: nao publicada:**
```
┌──────────────────────────────────────────────────┐
│ 📡 Talentum Pre-Screening                        │
│                                                  │
│ Descripcion generada:                            │
│ ┌────────────────────────────────────────────┐   │
│ │ Descripcion de la Propuesta:               │   │
│ │ Se busca un profesional para...            │   │
│ │ ...                                        │   │
│ │ El Marco de Acompanamiento:                │   │
│ │ EnLite Health Solutions ofrece...          │   │
│ └────────────────────────────────────────────┘   │
│ [🔄 Regenerar descripcion]                       │
│                                                  │
│ Publicar en Talentum:  [  OFF ◯]                 │
│                                                  │
│ ⚠ Configura al menos 1 pregunta antes de publicar│
└──────────────────────────────────────────────────┘
```

**Estado: publicada:**
```
┌──────────────────────────────────────────────────┐
│ 📡 Talentum Pre-Screening              ● Activo  │
│                                                  │
│ Link del bot WhatsApp:                           │
│ https://wa.me/5491127227852?text=...             │
│ [📋 Copiar link]  [↗ Abrir WhatsApp]             │
│                                                  │
│ Slug: #u8m1outjd5                                │
│ Publicado: 02/04/2026 19:49                      │
│ Preguntas: 5                                     │
│                                                  │
│ Publicar en Talentum:  [◯ ON  ]                  │
│ ⚠ Desactivar eliminara el pre-screening          │
└──────────────────────────────────────────────────┘
```

### Fluxo do switch

1. **OFF → ON:**
   - Validar: tem perguntas configuradas?
   - Se nao tem `talentum_description`: chamar `POST /generate-talentum-description` e mostrar preview
   - Confirmar: "Esto creara un pre-screening en Talentum. Continuar?"
   - Chamar `POST /api/admin/vacancies/:id/publish-talentum`
   - Atualizar card com `whatsappUrl`

2. **ON → OFF:**
   - Confirmar: "Esto eliminara el pre-screening de Talentum. Los candidatos ya no podran responder."
   - Chamar `DELETE /api/admin/vacancies/:id/publish-talentum`
   - Limpar card

### Criterios de aceite

- CA-7.1: Card exibe estado correto (publicado/nao publicado) baseado em `talentum_project_id`
- CA-7.2: Switch desabilitado se nao ha perguntas configuradas (com tooltip explicativo)
- CA-7.3: Descricao pode ser visualizada e regenerada antes de publicar
- CA-7.4: Apos publicar, link do WhatsApp e exibido e copiavel
- CA-7.5: Despublicar pede confirmacao e chama DELETE
- CA-7.6: Loading state durante publicacao (switch desabilitado + spinner)
- CA-7.7: Erro da API Talentum exibido como toast
- CA-7.8: i18n em es-AR

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/VacancyTalentumCard.tsx` | CRIAR |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — adicionar card |
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | MODIFICAR — 3 novos metodos |
| `enlite-frontend/src/hooks/admin/useVacancyDetail.ts` | MODIFICAR — incluir dados Talentum |

---

## Step 8 — QA: Validacao completa

### Backend

- [ ] `TalentumApiClient`: login funciona com RSA-OAEP SHA-256
- [ ] `TalentumApiClient`: re-login automatico apos expiracao do token
- [ ] `TalentumApiClient`: createPrescreening retorna projectId + publicId
- [ ] `TalentumApiClient`: getPrescreening retorna whatsappUrl
- [ ] Migration roda sem erros (banco limpo + existente)
- [ ] `TalentumDescriptionService`: gera texto com 3 secoes corretas
- [ ] `TalentumDescriptionService`: secao 3 e sempre o texto padrao fixo
- [ ] `TalentumDescriptionService`: nao vaza dados sensiveis do paciente
- [ ] `POST /publish-talentum`: cria prescreening e salva referencias
- [ ] `POST /publish-talentum`: falha 400 se nao ha perguntas
- [ ] `POST /publish-talentum`: falha 409 se ja publicada
- [ ] `DELETE /publish-talentum`: remove da Talentum e limpa colunas
- [ ] `GET/POST /prescreening-config`: CRUD de perguntas funciona
- [ ] `npm run build` compila sem erros
- [ ] Nenhum arquivo ultrapassa 400 linhas

### Frontend

- [ ] Modal criar vaga: abre, valida, cria, redireciona
- [ ] Modal editar vaga: abre pre-populado, salva
- [ ] Prescreening config: adicionar/remover/reordenar perguntas
- [ ] Prescreening config: validacao (min 1 pergunta para publicar)
- [ ] Switch Talentum: publica com confirmacao
- [ ] Switch Talentum: despublica com confirmacao
- [ ] Link WhatsApp: exibido e copiavel apos publicacao
- [ ] Descricao: gerada automaticamente e editavel/regeneravel
- [ ] `pnpm type-check` passa
- [ ] `pnpm lint` passa
- [ ] i18n: todos os textos em es-AR

---

## Diagrama de Dependencias

```
Step 1 (TalentumApiClient) ──┐
                              ├──→ Step 4 (Use Case + Endpoints)
Step 3 (DescriptionService) ─┘        │
                                       │
Step 2 (Migration) ───────────────────┤
                                       │
Step 5 (Form criar/editar) ──────────┤
                                       │
Step 6 (Prescreening config) ────────┤
                                       │
Step 7 (Switch + whatsappUrl) ───────┤
                                       │
                                       └──→ Step 8 (QA)
```

**Ordem recomendada de execucao:**
1. Steps 1 + 2 + 3 (backend, podem ser paralelos)
2. Step 4 (depende de 1, 2 e 3)
3. Steps 5 + 6 (frontend, podem ser paralelos, dependem de 2 e 4)
4. Step 7 (depende de 4, 5 e 6)
5. Step 8 (depende de todos)

---

## Referencias

- API Talentum documentada: `docs/TALENTUM_OUTBOUND_API.md`
- Template de descricao: fornecido pelo COO (template GEM usado pelas recrutadoras)
- Groq existente: `worker-functions/src/infrastructure/services/JobPostingEnrichmentService.ts`
- Schema `job_postings`: migrations 011, 046, 047, 082
- Padrao de use case: `worker-functions/src/application/usecases/ProcessTalentumPrescreening.ts`
