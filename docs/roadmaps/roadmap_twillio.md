# Roadmap: Módulo de Mensagens WhatsApp (Twilio)

## Visão Geral

Módulo para envio de mensagens WhatsApp via Twilio, usando templates pré-aprovados.
Inclui trigger automático para workers identificados pela fonte `talent_search`.

### Decisão de design: módulo destacável

O módulo foi projetado para ser **extraído para uma Cloud Function dedicada** sem
alterações no resto da aplicação. O ponto de extração é único e explícito.

```
Hoje (in-process):
  MessagingController → IMessagingService → TwilioMessagingService → Twilio API

Futuro (Cloud Function):
  MessagingController → IMessagingService → CloudFunctionMessagingService → Cloud Function → Twilio API
```

**Para migrar:** criar `CloudFunctionMessagingService implements IMessagingService` e trocar
uma linha de inicialização em `src/index.ts`. Nada mais muda.

---

## Estado atual

| Arquivo | Estado |
|---|---|
| `src/domain/ports/IMessagingService.ts` | ✅ **Concluído (Fase 1)** — `templateSlug` + `variables`, `externalId` |
| `src/domain/entities/MessageTemplate.ts` | ✅ **Concluído (Fase 2)** — entidade + DTO |
| `src/infrastructure/repositories/MessageTemplateRepository.ts` | ✅ **Concluído (Fase 2)** — `findBySlug`, `findAll`, `upsert` |
| `migrations/059_add_message_templates.sql` | ✅ **Concluído (Fase 2)** — aplicada, 3 templates de seed |
| `src/infrastructure/services/TwilioMessagingService.ts` | ✅ **Concluído (Fase 3)** — recebe `templateRepo`, resolve slug → body, interpola variáveis |
| `src/infrastructure/services/OutboxProcessor.ts` | ✅ **Concluído (Fase 4)** — polling 30s, batch 50, max 3 tentativas, status sent/failed |
| `migrations/060_talent_search_outbox_trigger.sql` | ✅ **Concluído (Fase 4)** — `messaging_outbox` + `trg_talent_search_welcome` |
| `src/interfaces/controllers/MessagingController.ts` | ⚠️ Atualizado para passar `templateRepo` → **DI via construtor pendente** (Fase 5) |
| `tests/e2e/message-templates.test.ts` | ✅ **Concluído (Fase 2)** — 17 testes, schema + seed + repositório, sem mocks |
| `src/interfaces/routes/messagingRoutes.ts` | ❌ Não existe — rotas estão em `src/index.ts` |
| Outbox + trigger talent_search | ❌ Não existe |

---

## Fases de Implementação

### Fase 1 — Ajuste do Port `IMessagingService` ✅ Concluído em 2026-03-26

**Arquivo:** `src/domain/ports/IMessagingService.ts`

Substituir `body: string` livre por `templateSlug` + `variables`.
O template resolve o corpo da mensagem — o serviço nunca recebe texto livre.

```typescript
export interface SendWhatsAppOptions {
  to: string;
  templateSlug: string;                      // ex: 'talent_search_welcome'
  variables?: Record<string, string>;        // ex: { name: 'Maria' }
}

export interface MessageSentResult {
  externalId: string;   // Twilio SID (hoje) ou ID da Cloud Function (futuro)
  status: string;
  to: string;
}

export interface IMessagingService {
  sendWhatsApp(options: SendWhatsAppOptions): Promise<Result<MessageSentResult>>;
}
```

> **Por que sem `body` livre?** Garante que toda mensagem enviada tem rastreabilidade
> via template. Facilita auditoria e compliance (LGPD).

**O que foi feito:**
- Removidos `body: string`, `templateSid?` e `templateVariables?` de `SendWhatsAppOptions`
- Adicionados `templateSlug: string` + `variables?: Record<string, string>`
- `messageSid` renomeado para `externalId` em `MessageSentResult`
- `TwilioMessagingService` e `MessagingController` atualizados para compilar com a nova interface (`templateSlug` usado como body placeholder até a Fase 3)

---

### Fase 2 — Tabela de Templates + Repositório ✅ Concluído em 2026-03-26

**Migration:** `migrations/059_add_message_templates.sql` — aplicada

```sql
CREATE TABLE message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(100) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,          -- ex: 'Olá {{name}}, encontramos uma vaga...'
  category    VARCHAR(50),            -- 'onboarding' | 'recruitment' | 'notification'
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Templates iniciais
INSERT INTO message_templates (slug, name, body, category) VALUES
  ('talent_search_welcome',
   'Boas-vindas Talent Search',
   'Olá {{name}}! Encontramos o seu perfil e gostaríamos de apresentar oportunidades na área da saúde. Podemos conversar?',
   'onboarding'),

  ('vacancy_match',
   'Vaga Compatível',
   'Olá {{name}}! Temos uma vaga de {{role}} em {{location}} que combina com o seu perfil. Tem interesse?',
   'recruitment'),

  ('encuadre_scheduled',
   'Entrevista Agendada',
   'Olá {{name}}! Sua entrevista foi agendada para {{date}} às {{time}}. Confirma presença?',
   'notification');
```

**Arquivos criados:**
- `src/domain/entities/MessageTemplate.ts` — `MessageTemplate` + `UpsertMessageTemplateDTO`
- `src/infrastructure/repositories/MessageTemplateRepository.ts`
  - `findBySlug(slug)` — retorna `null` para slug inexistente ou template inativo
  - `findAll(onlyActive?)` — padrão `true`; ordena por `category, slug`
  - `upsert(dto)` — ON CONFLICT (slug): sobrescreve `name`, `body`, `category`, `is_active`; retorna `{ entity, created: boolean }`

**Testes E2E criados:** `tests/e2e/message-templates.test.ts` — **17 testes, todos verdes**
- Schema: tabela existe, colunas corretas, constraint UNIQUE, seed data
- `findBySlug`: happy path, slug inexistente, template inativo
- `findAll`: flag `onlyActive`, mapeamento de campos
- `upsert`: INSERT (`created=true`), ON CONFLICT (`created=false`), soft delete, `updated_at` avança

---

### Fase 3 — Atualizar `TwilioMessagingService` ✅ Concluído em 2026-03-26

**Arquivo:** `src/infrastructure/services/TwilioMessagingService.ts`

Ajustes necessários:
1. Aceitar `templateSlug` + `variables` em vez de `body` livre
2. Resolver o body do template via `MessageTemplateRepository` antes de enviar
3. Interpolar variáveis (`{{name}}` → valor real)
4. Manter `normalizeNumber()` sem alteração (já funciona)

```typescript
// Único arquivo que conhece "twilio" — tudo mais usa IMessagingService
async sendWhatsApp(options: SendWhatsAppOptions): Promise<Result<MessageSentResult>> {
  const template = await this.templateRepo.findBySlug(options.templateSlug);
  if (!template) return Result.fail(`Template '${options.templateSlug}' não encontrado`);

  const body = this.interpolate(template.body, options.variables ?? {});
  // ... resto: normaliza número, chama client.messages.create, retorna Result
}

private interpolate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
```

> **Regra de destacabilidade:** `TwilioMessagingService` é o único arquivo que importa
> `twilio`. Para extrair para Cloud Function, apenas este arquivo sai da codebase.

---

### Fase 4 — Outbox + Trigger para Talent Search ✅ Concluído em 2026-03-26

**Migration:** `migrations/060_talent_search_outbox_trigger.sql`

```sql
-- Fila de mensagens pendentes (desacopla trigger do envio)
CREATE TABLE messaging_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    UUID NOT NULL REFERENCES workers(id),
  template_slug VARCHAR(100) NOT NULL,
  variables    JSONB DEFAULT '{}',
  status       VARCHAR(20) DEFAULT 'pending',  -- pending | sent | failed
  attempts     INT DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_messaging_outbox_pending ON messaging_outbox(status, created_at)
  WHERE status = 'pending';

-- Trigger: dispara quando talent_search é adicionado a um worker pela 1ª vez
CREATE OR REPLACE FUNCTION fn_queue_talent_search_welcome()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.data_sources @> ARRAY['talent_search']::text[]
    AND (OLD IS NULL OR NOT OLD.data_sources @> ARRAY['talent_search']::text[])
  ) THEN
    INSERT INTO messaging_outbox (worker_id, template_slug, variables)
    VALUES (
      NEW.id,
      'talent_search_welcome',
      jsonb_build_object('name', COALESCE(NEW.full_name, 'Profissional'))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_talent_search_welcome
  AFTER INSERT OR UPDATE OF data_sources ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_queue_talent_search_welcome();
```

**Novo serviço:** `src/infrastructure/services/OutboxProcessor.ts`

- Chamado via `setInterval` ou manualmente após imports
- Busca até N registros `pending` ordenados por `created_at`
- Para cada um: busca phone do worker → chama `IMessagingService.sendWhatsApp()`
- Atualiza `status`, `processed_at`, `attempts` e `error` conforme resultado
- Máximo de 3 tentativas por mensagem (campo `attempts`)

```typescript
// Inicia polling ao subir a aplicação (src/index.ts)
const outboxProcessor = new OutboxProcessor(messagingService, db);
outboxProcessor.start(intervalMs: 30_000); // a cada 30s
```

> **Por que outbox e não chamar diretamente no trigger?**
> O trigger é síncrono no PostgreSQL — não pode fazer HTTP. A `messaging_outbox`
> desacopla o evento do envio, garante retentativas e auditoria de falhas.

---

### Fase 5 — Controller e Rotas ⏳ Pendente

**Atualizar:** `src/interfaces/controllers/MessagingController.ts`
- Injetar `IMessagingService` no construtor (não mais `new TwilioMessagingService()`)
- Substituir `message` por `templateSlug` + `variables` nos endpoints
- Adicionar métodos para CRUD de templates

**Criar:** `src/interfaces/routes/messagingRoutes.ts`

```
POST   /api/admin/messaging/whatsapp           → envia template ao worker (por workerId)
POST   /api/admin/messaging/whatsapp/direct    → envia template a número direto
GET    /api/admin/messaging/templates          → lista templates ativos
POST   /api/admin/messaging/templates          → cria template
PUT    /api/admin/messaging/templates/:slug    → atualiza template
DELETE /api/admin/messaging/templates/:slug    → desativa template (soft delete)
```

Remover registro inline de rotas de `src/index.ts` e importar `messagingRoutes`.

---

### Fase 6 — Testes E2E ⏳ Pendente

**Criar:** `tests/e2e/whatsapp-messaging.test.ts`

```
✓ POST /whatsapp — envia template existente a worker com phone → 200 + externalId
✓ POST /whatsapp — templateSlug inexistente → 400
✓ POST /whatsapp — workerId inexistente → 404
✓ POST /whatsapp — worker sem telefone → 422
✓ POST /whatsapp/direct — envia a número direto → 200
✓ GET  /templates — retorna lista com templates ativos
✓ POST /templates — cria template novo → 201
✓ PUT  /templates/:slug — atualiza body do template → 200
✓ Twilio SDK mockado via jest.mock para não fazer chamadas reais
```

**Criar:** `tests/e2e/talent-search-trigger.test.ts`

```
✓ INSERT worker sem talent_search → messaging_outbox permanece vazia
✓ INSERT worker com talent_search → cria 1 registro pending em messaging_outbox
✓ UPDATE worker adicionando talent_search → cria 1 registro pending
✓ UPDATE worker que já tem talent_search → NÃO cria duplicata
✓ OutboxProcessor processa pending → chama IMessagingService com templateSlug correto
✓ OutboxProcessor atualiza status para 'sent' após sucesso
✓ OutboxProcessor atualiza status para 'failed' + registra error após falha
✓ OutboxProcessor respeita máximo de 3 tentativas
```

---

## Ordem de execução

```
✅ 1. Fase 2 → migration + entidade + repositório de templates  (schema primeiro)
✅ 2. Fase 1 → ajustar IMessagingService
✅ 3. Fase 3 → ajustar TwilioMessagingService (adaptar ao novo port)
✅ 4. Fase 4 → migration outbox + trigger + OutboxProcessor
⏳ 5. Fase 5 → controller via injeção + messagingRoutes.ts
⏳ 6. Fase 6 → /e2e-create → /e2e-run
```

---

## Como extrair para Cloud Function (futuro)

Quando a Cloud Function estiver pronta:

1. Criar `src/infrastructure/services/CloudFunctionMessagingService.ts`:
   ```typescript
   // Implementa IMessagingService
   // Em vez de chamar Twilio, faz POST para a URL da Cloud Function
   // Payload: { phone, templateSlug, variables }
   export class CloudFunctionMessagingService implements IMessagingService { ... }
   ```

2. Em `src/index.ts`, trocar UMA linha:
   ```typescript
   // Antes:
   const messagingService = new TwilioMessagingService(templateRepo);
   // Depois:
   const messagingService = new CloudFunctionMessagingService();
   ```

3. Remover `TwilioMessagingService.ts` e a dependência `twilio` do `package.json`.

**Nada mais muda.** Controller, outbox, trigger, rotas e testes continuam idênticos.

---

## Variáveis de ambiente

| Variável | Descrição | Necessária em |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | SID da conta Twilio | Hoje (in-process) |
| `TWILIO_AUTH_TOKEN` | Token de autenticação | Hoje (in-process) |
| `TWILIO_WHATSAPP_NUMBER` | Número remetente (+DDI...) | Hoje (in-process) |
| `CLOUD_FUNCTION_MESSAGING_URL` | URL da Cloud Function | Futuro (ao migrar) |

---

## Arquivos do módulo (mapa completo)

```
src/domain/
  ports/IMessagingService.ts                           ✅ contrato atualizado (Fase 1)
  entities/MessageTemplate.ts                          ✅ criado (Fase 2)

src/infrastructure/
  services/TwilioMessagingService.ts                   ⚠️ compila — template lookup pendente (Fase 3)
  services/OutboxProcessor.ts                          ✅ criado (Fase 4)
  repositories/MessageTemplateRepository.ts            ✅ criado (Fase 2)

src/interfaces/
  controllers/MessagingController.ts                   ⚠️ API atualizada — DI pendente (Fase 5)
  routes/messagingRoutes.ts                            ⏳ pendente (Fase 5)

migrations/
  059_add_message_templates.sql                        ✅ aplicada (Fase 2)
  060_talent_search_outbox_trigger.sql                 ✅ pendente de aplicar (Fase 4)

tests/e2e/
  message-templates.test.ts                           ✅ 17 testes verdes (Fase 2)
  whatsapp-messaging.test.ts                           ⏳ pendente (Fase 6)
  talent-search-trigger.test.ts                        ⏳ pendente (Fase 6)
```
