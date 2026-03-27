# Roadmap: Talentum Prescreening Webhook

**Data:** 2026-03-25
**Autor:** Gabriel Stein
**Status:** Concluído — todos os Steps implementados e testados (57 testes E2E passando)

---

## Contexto

O Talentum é um parceiro externo que realiza prescreenings de candidatos para vagas do sistema Enlite.

### Fluxo de comunicação

```
App Talentum → n8n (webhook) → nossa Cloud Function → banco de dados
```

O n8n atua como intermediário: recebe o evento do Talentum, faz o redirecionamento para nossa
Cloud Function e é responsável por enviar de volta qualquer callback de confirmação ao Talentum.
Nossa Cloud Function só precisa responder `200 OK` ao n8n.

### Comportamento incremental — ponto crítico

O Talentum **não envia o prescreening uma única vez**. A cada resposta que o worker dá no app,
um novo POST é disparado com o **objeto completo acumulado até aquele momento**. Ou seja:

```
POST 1 → { status: INITIATED, response.state: [] }
POST 2 → { status: IN_PROGRESS, response.state: [Q1] }
POST 3 → { status: IN_PROGRESS, response.state: [Q1, Q2] }
...
POST N → { status: COMPLETED, response.state: [Q1, Q2, ..., QN] }
```

Isso significa que toda a lógica de persistência deve ser **upsert puro** — nunca insert simples.
O mesmo `questionId` pode ser recebido múltiplas vezes; a constraint de unicidade garante idempotência.

### Payload recebido

```json
{
  "prescreening": {
    "id": "string",        // ID do prescreening no Talentum — chave de deduplicação
    "name": "string",      // Nome do caso da vaga — usado para resolver job_posting_id
    "status": "INITIATED | IN_PROGRESS | COMPLETED"
  },
  "profile": {
    "id": "string",        // ID do perfil no Talentum
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phoneNumber": "string",
    "cuil": "string",
    "registerQuestions": [  // Perguntas de cadastro do worker (podem ser iguais entre prescreenings)
      { "questionId": "string", "question": "string", "answer": "string", "responseType": "string" }
    ]
  },
  "response": {
    "id": "string",
    "state": [              // Respostas acumuladas para esta vaga específica
      { "questionId": "string", "question": "string", "answer": "string", "responseType": "string" }
    ]
  }
}
```

---

## Estado Atual do Sistema

### Worker (tabela `workers`)
- Já existe com PII criptografada via KMS (firstName, lastName, documentNumber, etc.)
- Lookup disponível por: email, phone, cuil (via `WorkerRepository`)
- `overall_status` tracking: PRE_TALENTUM | TALENTUM | QUALIFIED | NOT_QUALIFIED | IN_DOUBT | ...

### Job Postings (tabela `job_postings`)
- Já existe (`JobPostingARRepository`)
- Identificada por `case_name` (ILIKE)
- `prescreening.name` no payload traz o **nome do caso da vaga**

### O que NÃO existe ainda
- Tabela `talentum_prescreenings`
- Tabela `talentum_questions` (catálogo de perguntas)
- Tabela `talentum_prescreening_responses`
- Endpoint `POST /api/webhooks/talentum/prescreening`
- Validação/sanitização do payload Talentum

---

## Decisão de Arquitetura

### Por que NÃO reutilizar tabelas existentes

| Alternativa | Problema |
|---|---|
| Salvar respostas em `workers` como colunas | As perguntas variam; um worker responde de forma diferente para vagas diferentes |
| Reutilizar `worker_job_applications` | Essa tabela é sobre o funil de candidatura, não sobre o conteúdo das respostas |
| Salvar tudo como JSON em uma coluna JSONB | Impede queries analíticas, filtros por pergunta específica, e evolução de schema |

### Solução: 3 novas tabelas dedicadas

```
talentum_prescreenings           → 1 registro por tentativa (worker × vaga), atualizado a cada POST
talentum_questions               → catálogo deduplicado de perguntas (por questionId do Talentum)
talentum_prescreening_responses  → respostas: N por prescreening, uma por (prescreening, question, source)
```

---

## Modelo de Dados

### `talentum_prescreenings`

```sql
CREATE TABLE talentum_prescreenings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talentum_prescreening_id VARCHAR(255) UNIQUE NOT NULL,  -- ID vindo do Talentum — chave de dedup
  talentum_profile_id      VARCHAR(255) NOT NULL,         -- ID do perfil no Talentum
  worker_id                UUID REFERENCES workers(id) ON DELETE SET NULL,
  job_posting_id           UUID REFERENCES job_postings(id) ON DELETE SET NULL,
  job_case_name            TEXT NOT NULL,                 -- prescreening.name raw (para auditoria)
  status                   VARCHAR(50) NOT NULL
                           CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_talentum_prescreenings_worker   ON talentum_prescreenings(worker_id);
CREATE INDEX idx_talentum_prescreenings_posting  ON talentum_prescreenings(job_posting_id);
CREATE INDEX idx_talentum_prescreenings_status   ON talentum_prescreenings(status);
CREATE INDEX idx_talentum_prescreenings_profile  ON talentum_prescreenings(talentum_profile_id);
```

**Por que `worker_id` e `job_posting_id` são nullable?**
- O webhook pode chegar antes do worker existir no sistema (race condition com import de planilha)
- A vaga pode estar no ClickUp mas ainda não importada
- Nunca rejeitamos o prescreening por isso — cada novo POST tenta resolver as FKs novamente
- Como o Talentum envia múltiplos POSTs incrementais, a FK vai ser preenchida naturalmente
  quando o worker/vaga existir no sistema durante um dos POSTs seguintes

**Estratégia ON CONFLICT:**
```sql
ON CONFLICT (talentum_prescreening_id) DO UPDATE SET
  status         = EXCLUDED.status,          -- sempre sobrescreve (INITIATED → IN_PROGRESS → COMPLETED)
  worker_id      = COALESCE(talentum_prescreenings.worker_id, EXCLUDED.worker_id),   -- preenche se era null
  job_posting_id = COALESCE(talentum_prescreenings.job_posting_id, EXCLUDED.job_posting_id), -- idem
  updated_at     = NOW()
```

---

### `talentum_questions`

```sql
CREATE TABLE talentum_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   VARCHAR(255) UNIQUE NOT NULL,  -- questionId vindo do Talentum
  question      TEXT NOT NULL,                 -- texto da pergunta
  response_type VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Por que deduplificar perguntas?**
- A mesma `questionId` aparece em múltiplos prescreenings e em múltiplos POSTs do mesmo prescreening
- Permite analytics: "qual pergunta tem mais respostas negativas?"
- Evita armazenar o texto completo da pergunta N vezes em `responses`

**Estratégia ON CONFLICT:**
```sql
ON CONFLICT (question_id) DO UPDATE SET
  question      = EXCLUDED.question,       -- texto pode mudar no Talentum — sobrescreve
  response_type = EXCLUDED.response_type,  -- idem
  updated_at    = NOW()
```

---

### `talentum_prescreening_responses`

```sql
CREATE TABLE talentum_prescreening_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescreening_id   UUID NOT NULL REFERENCES talentum_prescreenings(id) ON DELETE CASCADE,
  question_id       UUID NOT NULL REFERENCES talentum_questions(id),
  answer            TEXT,                -- null = sem resposta ainda (pode ser preenchida em POST posterior)
  response_source   VARCHAR(50) NOT NULL -- 'register' | 'prescreening'
                    CHECK (response_source IN ('register', 'prescreening')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prescreening_id, question_id, response_source)
);

CREATE INDEX idx_talentum_responses_prescreening ON talentum_prescreening_responses(prescreening_id);
CREATE INDEX idx_talentum_responses_question     ON talentum_prescreening_responses(question_id);
```

**`response_source`**: diferencia perguntas de cadastro (`profile.registerQuestions`) de perguntas
específicas da vaga (`response.state`). A mesma `questionId` pode aparecer nas duas fontes com
respostas diferentes — ambas têm valor analítico.

**Estratégia ON CONFLICT — fundamental para o fluxo incremental:**
```sql
ON CONFLICT (prescreening_id, question_id, response_source) DO UPDATE SET
  answer     = EXCLUDED.answer,   -- sobrescreve: worker pode editar antes do COMPLETED
  updated_at = NOW()
```

---

## Fluxo do Endpoint

```
POST /api/webhooks/talentum/prescreening
```

Sem autenticação Firebase. O endpoint é chamado pelo n8n, que é responsável por:
- Receber o evento do Talentum
- Chamar esta Cloud Function
- Enviar o callback de confirmação de volta ao Talentum

**Autenticação via Google Service Account.** O n8n chama a Cloud Function com um `Authorization: Bearer <id_token>`
gerado pela Service Account configurada no n8n. A Cloud Function valida o token usando a Google Auth Library
antes de qualquer processamento.

### Sequência de operações

```
1. Validar Google ID Token (Authorization: Bearer <id_token>)
   Verificar via `OAuth2Client.verifyIdToken` com `audience = TALENTUM_WEBHOOK_AUDIENCE`
   ↓ 401 se ausente, expirado ou audience incorreta

2. Sanitizar e validar payload (Zod schema estrito)
   ↓ 400 com detalhes de validação se inválido

3. Tentar resolver worker_id (a cada POST, não apenas no primeiro):
   Buscar por: email → phoneNumber → cuil
   ↓ worker_id = null se não encontrado (não bloqueia)

4. Tentar resolver job_posting_id (a cada POST):
   Buscar job_posting por: prescreening.name (ILIKE em case_name)
   ↓ job_posting_id = null se não encontrado (não bloqueia)

5. Upsert em talentum_prescreenings
   → ON CONFLICT (talentum_prescreening_id): atualiza status, preenche FKs se eram null

6. Para cada item em profile.registerQuestions:
   a. Upsert em talentum_questions (ON CONFLICT question_id: atualiza texto/tipo)
   b. Upsert em talentum_prescreening_responses (source='register', ON CONFLICT: atualiza answer)

7. Para cada item em response.state:
   a. Upsert em talentum_questions (mesmo upsert do passo 6a)
   b. Upsert em talentum_prescreening_responses (source='prescreening', ON CONFLICT: atualiza answer)

8. Retornar 200 OK com { prescreeningId, workerId, jobPostingId, resolved }
   → n8n usa esse 200 para confirmar recebimento ao Talentum
```

### Resposta HTTP

```json
{
  "prescreeningId": "uuid-interno",
  "talentumPrescreeningId": "ext-id-talentum",
  "workerId": "uuid | null",
  "jobPostingId": "uuid | null",
  "resolved": {
    "worker": true,
    "jobPosting": false
  }
}
```

---

## Sanitização do Payload (Zod)

```typescript
// src/interfaces/validators/talentumPrescreeningSchema.ts

const TalentumQuestionItemSchema = z.object({
  questionId:   z.string().min(1).trim(),
  question:     z.string().min(1).trim(),
  answer:       z.string().trim(),        // pode ser string vazia (sem resposta ainda)
  responseType: z.string().min(1).trim(),
}).strict();

export const TalentumPrescreeningPayloadSchema = z.object({
  prescreening: z.object({
    id:     z.string().min(1).trim(),
    name:   z.string().min(1).trim(),
    status: z.enum(['INITIATED', 'IN_PROGRESS', 'COMPLETED']),
  }).strict(),
  profile: z.object({
    id:                z.string().min(1).trim(),
    firstName:         z.string().min(1).trim(),
    lastName:          z.string().min(1).trim(),
    email:             z.string().email().toLowerCase().trim(),
    phoneNumber:       z.string().min(1).trim(),
    cuil:              z.string().min(1).trim(),
    registerQuestions: z.array(TalentumQuestionItemSchema).default([]),
  }).strict(),
  response: z.object({
    id:    z.string().min(1).trim(),
    state: z.array(TalentumQuestionItemSchema).default([]),
  }).strict(),
}).strict();

export type TalentumPrescreeningPayload = z.infer<typeof TalentumPrescreeningPayloadSchema>;
```

---

## Estrutura de Arquivos

```
src/
├── domain/
│   └── entities/
│       └── TalentumPrescreening.ts              # interfaces + DTOs + tipos de domínio
│
├── application/
│   └── usecases/
│       └── ProcessTalentumPrescreening.ts        # orquestra a lógica, sem IO direto
│
├── infrastructure/
│   └── repositories/
│       └── TalentumPrescreeningRepository.ts     # acesso a DB (3 tabelas)
│
├── interfaces/
│   ├── controllers/
│   │   └── TalentumWebhookController.ts          # HTTP layer, chama use case
│   ├── routes/
│   │   └── talentumRoutes.ts                     # mountagem da rota
│   └── validators/
│       └── talentumPrescreeningSchema.ts          # Zod schema
│
migrations/
└── 057_add_talentum_prescreening_tables.sql
```

---

## Segurança

Seguindo a regra `security.md`:

- **Autenticação n8n→CloudFunction**: Google Service Account.
  O n8n envia um `Authorization: Bearer <google_id_token>` assinado pela Service Account.
  A Cloud Function valida o token com a biblioteca `google-auth-library` (`OAuth2Client.verifyIdToken`),
  verificando `aud` (audience = URL da Cloud Function) e `iss`. Nenhum segredo estático em variável de ambiente.
  Configuração necessária: a Service Account do n8n deve ter o papel `Cloud Run Invoker` (ou `Cloud Functions Invoker`)
  no projeto GCP.
- **Dados sensíveis**: `phoneNumber`, `cuil`, `email`, `firstName`, `lastName` são PII
  → Ao criar/atualizar o worker, criptografar via KMS (igual ao `WorkerRepository` existente)
  → Nas tabelas `talentum_*`, armazenar apenas `worker_id` (FK) — nunca duplicar PII
- **Logs**: Nunca logar CUIL/email/telefone crus — logar apenas IDs internos (prescreeningId, workerId)
- **Queries parametrizadas**: sempre `$1, $2...` — nunca interpolação de string em SQL
- **Rate limiting**: aplicar por IP via middleware existente

---

## Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Google ID Token ausente, expirado ou inválido | 401 Unauthorized |
| Payload inválido (schema Zod) | 400 + detalhes de validação |
| Worker não encontrado | Salva com `worker_id = null`; tenta novamente no próximo POST |
| Vaga não encontrada | Salva com `job_posting_id = null`; tenta novamente no próximo POST |
| Mesmo prescreening (POST incremental) | Upsert → atualiza status + respostas; 200 idempotente |
| Erro de DB | 500 + log interno; **nunca expor stack trace na resposta** |

---

## Steps de Implementação (ordem sugerida)

### Step 1 — Migração de banco ✅ 2026-03-25
- [x] Criar `migrations/057_add_talentum_prescreening_tables.sql`
- 3 tabelas criadas com índices, constraints e `COMMENT ON COLUMN` em todos os campos não-óbvios
- Estratégias de ON CONFLICT documentadas inline no SQL
- Migration aplicada e validada no banco de teste (18 testes E2E passando)

**Desvios do plano original:** nenhum.

### Step 2 — Domain entities ✅ 2026-03-25
- [x] Criar `src/domain/entities/TalentumPrescreening.ts`
- Interfaces: `TalentumPrescreening`, `TalentumQuestion`, `TalentumPrescreeningResponse`
- DTOs: `UpsertTalentumPrescreeningDTO`, `UpsertTalentumQuestionDTO`, `UpsertTalentumResponseDTO`
- Tipos: `TalentumPrescreeningStatus`, `TalentumResponseSource`
- `TalentumPrescreeningPayload` definido inline no domínio (o validator Zod usará este tipo como base no Step 3)

**Desvios do plano original:**
- DTOs renomeados de `CreateTalentumPrescreeningDTO` → `UpsertTalentumPrescreeningDTO` para refletir que a operação é sempre upsert, nunca insert puro.
- `TalentumQuestionItem` adicionado como tipo auxiliar para o payload externo.

### Step 2.5 — Testes E2E de schema e upserts ✅ 2026-03-25
- [x] Criar `tests/e2e/talentum-prescreening.test.ts` (39 testes DB-level, 8 grupos)
- [x] Atualizar `tests/e2e/setup.ts` — tabelas talentum adicionadas ao `TABLES_TO_TRUNCATE`

Cenários cobertos (DB-level):
- Schema: 3 tabelas, nullable corretos, UNIQUE constraint, 6 indexes
- CHECK constraints: `status` e `response_source` inválidos rejeitados
- Fluxo POST 1 → INITIATED, `worker_id = null`, zero respostas
- Fluxo POST 2 → `ON CONFLICT` avança status para IN_PROGRESS, salva primeira resposta
- Fluxo POST N → simula 3 POSTs incrementais completos até COMPLETED
- `response_source` como discriminador: mesma `questionId` em `register` e `prescreening` → 2 linhas distintas
- COALESCE: `worker_id` null → preenchido no POST seguinte; COALESCE impede sobrescrita por null em POSTs posteriores
- Idempotência: mesmo payload N vezes → 1 registro; `answer` atualizada no ON CONFLICT
- Cascade delete: DELETE em `talentum_prescreenings` remove respostas automaticamente
- Zod Validator: 10 cenários unit (email, strict, defaults, status inválido, campos obrigatórios)
- TalentumPrescreeningRepository: 11 testes de integração via classe real (todos os métodos)

### Step 3 — Zod validator ✅ 2026-03-25
- [x] Criar `src/interfaces/validators/talentumPrescreeningSchema.ts`
- Schema completo com `.strict()` em todos os níveis
- Exporta `TalentumPrescreeningPayloadInput` (input) e `TalentumPrescreeningPayloadParsed` (inferred)

**Desvios do plano original:** nenhum.

### Step 4 — Repository ✅ 2026-03-25
- [x] Criar `src/infrastructure/repositories/TalentumPrescreeningRepository.ts`
- Métodos: `upsertPrescreening()`, `upsertQuestion()`, `upsertResponse()`, `findByTalentumId()`
- Todo `ON CONFLICT` com comentário explicando a estratégia de cada campo
- `(xmax = 0) AS inserted` para detectar insert vs update em todos os upserts

**Desvios do plano original:** nenhum.

### Step 5 — Use case ✅ 2026-03-25
- [x] Criar `src/application/usecases/ProcessTalentumPrescreening.ts`
- Orquestra: tenta resolver worker + vaga → upserts na ordem correta (prescreening → questions → responses)
- Repositórios injetados via construtor (testável sem DB)
- Portas `IWorkerLookup` e `IJobPostingLookup` definidas inline para desacoplar do WorkerRepository concreto

**Desvios do plano original:** nenhum.

### Step 6 — Controller + Rota ✅ 2026-03-25
- [x] Criar `src/interfaces/controllers/TalentumWebhookController.ts`
- [x] Criar `src/interfaces/routes/talentumRoutes.ts`
- Validação Google ID Token via `OAuth2Client.verifyIdToken` (google-auth-library)
- Bypass automático quando `USE_MOCK_AUTH=true` (testes E2E)
- `JobPostingLookup` (adapter inline) faz ILIKE em `job_postings.title`
- [x] Rota montada em `src/index.ts`: `app.use('/api/webhooks/talentum', talentumRoutes)`

**Desvios do plano original:**
- `JobPostingLookup` implementado como classe privada no controller (não em repositório separado) — lookup é simples o suficiente para não justificar arquivo próprio.
- ILIKE aplicado em `title` (não `case_name` — coluna inexistente; `title` é o campo correto no schema real).

### Step 7 — Configuração GCP ✅ 2026-03-25
- [x] `google-auth-library` ^10.0.0 adicionado como dependência explícita em `package.json`
- [x] `TALENTUM_WEBHOOK_AUDIENCE` documentado em `.env.test` (comentado) com instrução sobre o papel `Cloud Functions Invoker`
- Operacional: a Service Account do n8n deve ter o papel `Cloud Functions Invoker` no projeto GCP

**Desvios do plano original:** nenhum.

### Step 8 — Testes E2E HTTP ✅ 2026-03-26
- [x] Adicionar describe `'Talentum Webhook — POST /api/webhooks/talentum/prescreening (HTTP)'` em `tests/e2e/talentum-prescreening.test.ts`
- [x] Corrigir `src/infrastructure/middleware/MockAuthMiddleware.ts`: `/api/webhooks/` adicionado ao `publicPaths`
- **57 testes passando, 1 skipped (401 prod-only)**

Cenários HTTP cobertos (19 testes):

**400 — payload inválido:**
- Body ausente → 400 com campo `details` (Zod flatten)
- `prescreening.status` inválido → 400
- Email malformado → 400
- Campo extra na raiz (`.strict()`) → 400
- `prescreening.id` vazio → 400
- `profile.firstName` vazio → 400

**401 — autenticação:**
- Sem Authorization header → 401 *(skip: USE_MOCK_AUTH=true em testes locais — testável apenas em produção)*
- Bypass confirmado: com `USE_MOCK_AUTH=true` → 200 sem token

**200 — INITIATED (sem respostas):**
- Retorna `prescreeningId`, `talentumPrescreeningId`, `resolved`
- Persiste prescreening no banco com `status = INITIATED`
- Sem respostas → `talentum_prescreening_responses` vazio

**200 — resolução de worker e job posting:**
- Worker encontrado por email → `workerId` preenchido, `resolved.worker = true`
- Job posting encontrado por ILIKE em `title` → `jobPostingId` preenchido, `resolved.jobPosting = true`
- Worker desconhecido → `workerId = null`, `resolved.worker = false`
- Job posting desconhecido → `jobPostingId = null`, `resolved.jobPosting = false`

**200 — fluxo incremental:**
- `registerQuestions` → respostas com `source = register` no banco
- `response.state` → respostas com `source = prescreening` no banco
- 3 POSTs incrementais (INITIATED → IN_PROGRESS → COMPLETED): estado final e contagem de respostas corretos
- Idempotência: mesmo payload 2× → 1 registro, mesmo `prescreeningId`
- COALESCE via endpoint: POST 1 sem job posting → null; job posting importado; POST 2 → resolvido

**Correção de infra aplicada durante execução:**
- `MockAuthMiddleware` bloqueava `/api/webhooks/talentum/` com 401 por ausência de `Authorization` header — rotas de webhook têm autenticação própria (Google ID Token) e não devem passar pelo fluxo Firebase mock. Adicionado `/api/webhooks/` ao `publicPaths`.
- Docker container rebuilado para carregar o novo código (`docker compose build api && up -d api`).

**Desvios do plano original:**
- Testes adicionados ao arquivo existente (novo `describe` de nível superior) em vez de arquivo separado — arquivo já cobria schema/repo e o novo bloco é o complemento natural.

---

## Impacto em Código Existente

| Arquivo | Mudança |
|---|---|
| `src/index.ts` | Mount das rotas `talentumRoutes` via `app.use('/api/webhooks/talentum', talentumRoutes)` |
| `src/infrastructure/middleware/MockAuthMiddleware.ts` | `/api/webhooks/` adicionado ao `publicPaths` — webhooks têm auth própria (Google ID Token) |
| `package.json` | `google-auth-library ^10.0.0` adicionado como dependência explícita |
| `src/domain/entities/Worker.ts` | Nenhum — `overall_status` já cobre TALENTUM |
| `src/infrastructure/repositories/WorkerRepository.ts` | Nenhum — métodos `findByEmail`, `findByPhone`, `findByCuit` já existem |
| `migrations/` | Nova migração 057 |

Nenhuma tabela existente foi alterada. Todo o novo dado fica isolado nas 3 novas tabelas.

---

## Decisões Técnicas Registradas

| Decisão | Motivo |
|---|---|
| `worker_id`/`job_posting_id` nullable + COALESCE no ON CONFLICT | Webhook pode chegar antes do import; os POSTs incrementais cobrem a resolução natural sem job de reconciliação |
| `response_source` como coluna discriminadora | A mesma `questionId` pode aparecer em `registerQuestions` e `response.state` com respostas diferentes — ambas devem ser preservadas |
| Upsert puro em todas as tabelas | Natureza incremental do Talentum: cada POST re-envia o objeto completo acumulado |
| Google Service Account (ID Token) em vez de Firebase JWT | É webhook de sistema externo via n8n; Service Account é o padrão GCP para autenticação machine-to-machine |
| Sem LLM neste fluxo | Prescreening é dado operacional; enriquecimento por LLM não está no escopo desta funcionalidade |
| `IWorkerLookup` e `IJobPostingLookup` como portas inline no use case | Desacopla `ProcessTalentumPrescreening` do `WorkerRepository` concreto; facilita testes unitários sem banco |
| `JobPostingLookup` como classe privada no controller | Lookup por ILIKE em `title` é simples demais para justificar arquivo próprio de repositório |
| ILIKE em `job_postings.title` (não `case_name`) | Coluna `case_name` não existe no schema real; `title` é o campo que recebe o nome do caso do ClickUp |
| `/api/webhooks/` no `publicPaths` do `MockAuthMiddleware` | Webhooks têm autenticação própria (Google ID Token); não devem passar pelo fluxo Firebase mock em testes |
