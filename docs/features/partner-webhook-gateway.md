# Partner Webhook Gateway

## O que e

Gateway interno que gerencia todo o ciclo de vida de chamadas webhook de parceiros externos: autenticacao da API Key via Google, autorizacao por path, roteamento para ambiente de producao ou teste, e dry-run para validacao de integracao.

Cada parceiro recebe uma **GCP API Key** (criada no Google Cloud Console) que envia no header `X-Partner-Key`. O gateway valida essa key diretamente com o Google, identifica o parceiro pelo `displayName` da key, verifica se ele tem permissao para o endpoint solicitado, e roteia para o controller correto com o contexto de parceiro injetado.

## Por que existe

Antes, o fluxo era:

```
Parceiro → N8N (valida key + verifica parceiro) → Backend
```

O N8N estava dando erros e sua unica funcao era:
1. Validar a API Key do parceiro via Google
2. Verificar se o parceiro tinha permissao para o endpoint
3. Encaminhar o request ao backend com token proprio

Movemos toda essa logica para dentro do backend, eliminando o ponto de falha e ganhando:
- **Autenticacao direta** com Google API (sem proxy)
- **Autorizacao por path** configuravel por parceiro via banco
- **Endpoints de teste** (`/webhooks-test/`) com dry-run para parceiros validarem integracao
- **Separacao arquitetural** preparada para extracao como microservico

## Como funciona

### Fluxo de producao

```
Parceiro (ex: Talentum)
  │  POST /api/webhooks/talentum/prescreening
  │  Header: X-Partner-Key: AIza...
  ▼
PartnerAuthMiddleware
  │  1. Le X-Partner-Key do header
  │  2. Chama Google API (apikeys.lookupKey) → obtem resource name
  │  3. Chama Google API (keys/{name}) → obtem displayName: "API-Key-Talentum"
  │  4. SELECT webhook_partners WHERE display_name = 'API-Key-Talentum' AND is_active
  │  5. Verifica se allowed_paths inclui 'talentum/*'
  │  6. Injeta partnerContext no request { partnerId, partnerName, isTest }
  ▼
Controller
  │  1. Valida payload (Zod)
  │  2. Executa use case
  ▼
200 OK
```

### Fluxo de teste (parceiros testando integracao)

```
Parceiro
  │  POST /api/webhooks-test/talentum/prescreening
  │  Header: X-Partner-Key: AIza...  (mesma key)
  ▼
PartnerAuthMiddleware
  │  (mesma validacao, mas isTest=true pela URL)
  ▼
Controller
  │  dryRun=true: resolve IDs mas nao persiste no banco
  ▼
200 OK (com resolucao de IDs para o parceiro validar)
```

### Codigos de resposta

| Status | Quando |
|--------|--------|
| 200 | Autenticado, autorizado, payload valido |
| 400 | Payload invalido (Zod validation) |
| 401 | Header `X-Partner-Key` ausente ou key invalida/revogada no Google |
| 403 | Key valida mas parceiro nao registrado, inativo, ou sem permissao para o path |
| 500 | Erro interno (DB, etc.) |

## Componentes

### Tabela `webhook_partners`

Armazena o mapeamento de parceiros e seus paths permitidos. **Nao armazena keys** — a validacao e feita pelo Google.

```sql
webhook_partners
  id            UUID PK
  name          VARCHAR(100) UNIQUE    -- 'talentum', 'anacare'
  display_name  VARCHAR(200) UNIQUE    -- 'API-Key-Talentum' (nome da key no GCP Console)
  allowed_paths TEXT[]                 -- ['talentum/*']
  is_active     BOOLEAN DEFAULT true
  metadata      JSONB                  -- contato, notas
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ
```

### GoogleApiKeyValidator

Servico que encapsula a chamada a Google API:
1. `lookupKey` — valida a key e obtem o resource name
2. `keys/{name}` — busca detalhes incluindo `displayName`
3. Cache em memoria (TTL 5 min, chave = SHA-256 hash da API key)
4. Bypass automatico em modo teste (`USE_MOCK_AUTH=true`)

**Arquivo:** `src/infrastructure/services/GoogleApiKeyValidator.ts`

### PartnerAuthMiddleware

Middleware Express dedicado (separado do `AuthMiddleware` que cuida de Firebase/JWT):
1. Le `X-Partner-Key` do header
2. Valida via `GoogleApiKeyValidator`
3. Busca parceiro no banco por `displayName`
4. Verifica glob de paths (`talentum/*` cobre `talentum/prescreening`, `talentum/status`, etc.)
5. Injeta `partnerContext` no request

**Arquivo:** `src/interfaces/webhooks/middleware/PartnerAuthMiddleware.ts`

### Router unificado

Uma unica factory `createWebhookRoutes(partnerAuth)` cria o router, reutilizada para ambos os mounts:

```typescript
app.use('/api/webhooks', createWebhookRoutes(partnerAuth));       // producao
app.use('/api/webhooks-test', createWebhookRoutes(partnerAuth));  // teste (dev only)
```

**Arquivo:** `src/interfaces/webhooks/routes/webhookRoutes.ts`

## Endpoints de teste

URL: `/api/webhooks-test/<parceiro>/<endpoint>`

- Mesma key do parceiro funciona em ambas as URLs
- O prefixo da URL (`/webhooks-test/`) define `isTest=true`
- Em modo teste, o use case roda com `dryRun=true`: resolve worker e job posting mas nao persiste no banco
- Habilitado automaticamente em dev (`NODE_ENV !== 'production'`) ou via `ENABLE_TEST_WEBHOOKS=true`

## Como adicionar um novo parceiro

### 1. Criar API Key no GCP Console

- Google Cloud Console → APIs & Services → Credentials → Create API Key
- Nomear: `API-Key-<NomeParceiro>` (ex: `API-Key-AnaCare`)
- Restringir a API: selecionar a API relevante

### 2. Registrar no banco

```bash
npx ts-node scripts/seed-webhook-partners.ts \
  --name anacare \
  --display-name "API-Key-AnaCare" \
  --paths "anacare/*"
```

Ou via SQL:

```sql
INSERT INTO webhook_partners (name, display_name, allowed_paths)
VALUES ('anacare', 'API-Key-AnaCare', ARRAY['anacare/*']);
```

### 3. Criar controller e rota

1. Criar controller em `src/interfaces/webhooks/controllers/`
2. Adicionar rota em `webhookRoutes.ts` com `partnerAuth.requirePartnerKey()`
3. Criar testes unitarios e E2E

### 4. Enviar key ao parceiro

Compartilhar a API Key (visivel no GCP Console → "Ver chave") para o parceiro colocar no header `X-Partner-Key`.

## Como desativar um parceiro

```sql
UPDATE webhook_partners SET is_active = false WHERE name = 'talentum';
```

O cache expira em 5 minutos. Para efeito imediato, reiniciar o servico.

Para revogar a key permanentemente, tambem deletar/desabilitar no GCP Console.

## Estrutura de arquivos

Todos os arquivos de webhook estao agrupados em `src/interfaces/webhooks/` para facilitar futura extracao como microservico:

```
src/interfaces/webhooks/
  middleware/
    PartnerAuthMiddleware.ts          -- middleware de auth
  controllers/
    TalentumWebhookController.ts      -- controller Talentum (sem auth inline)
    TwilioWebhookController.ts        -- controller Twilio (auth propria via X-Twilio-Signature)
  routes/
    webhookRoutes.ts                  -- router factory unificado
  validators/
    talentumPrescreeningSchema.ts     -- schema Zod do payload

src/infrastructure/services/
  GoogleApiKeyValidator.ts            -- validacao de GCP API Key

src/infrastructure/repositories/
  WebhookPartnerRepository.ts         -- acesso a tabela webhook_partners

src/domain/
  entities/WebhookPartner.ts          -- entidade + PartnerContext
  ports/IWebhookPartnerRepository.ts  -- interface do repositorio

migrations/
  092_create_webhook_partners.sql     -- tabela + seed Talentum
  093_add_environment_to_prescreenings.sql  -- coluna environment

scripts/
  seed-webhook-partners.ts            -- CLI para registrar parceiros
```

## Variaveis de ambiente

| Variavel | Descricao | Default |
|----------|-----------|---------|
| `ENABLE_TEST_WEBHOOKS` | Habilita `/api/webhooks-test/` em producao | `false` (auto em dev) |
| `USE_MOCK_AUTH` | Bypass de toda autenticacao (testes E2E) | `false` |

## Testes

### Unitarios

- `GoogleApiKeyValidator.test.ts` — 25 testes (cache, TTL, erros Google API, mock mode)
- `PartnerAuthMiddleware.test.ts` — 34 testes (auth, autorizacao por path, multi-parceiro, edge cases)
- `TalentumWebhookController.test.ts` — 30 testes (validacao Zod, propagacao environment, erros)

### E2E

- `partner-webhook-auth.test.ts` — schema da tabela, endpoints prod/test, coluna environment
