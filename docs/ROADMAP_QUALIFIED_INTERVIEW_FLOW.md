# Roadmap — Fluxo Qualified → Entrevista via WhatsApp

> Quando o Talentum marca um worker como QUALIFIED, o sistema envia automaticamente uma mensagem WhatsApp interativa com 3 horários de entrevista (Meet links da vaga). O worker escolhe pelo WhatsApp, é adicionado ao Google Calendar, e recebe lembrete 24h antes perguntando se confirma. Se declinar, o slot é liberado e o admin é notificado.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Infraestrutura Event-Driven (Pub/Sub + Cloud Tasks) | DONE |
| **Step 2** | Migration + Templates de Mensagem | DONE |
| **Step 3** | Migrar serviços existentes para event-driven | DONE |
| **Step 4** | Emitir evento no QUALIFIED (Transactional Outbox + Pub/Sub) | DONE |
| **Step 5** | QualifiedInterviewHandler (Pub/Sub push) | DONE |
| **Step 6** | Interactive Messages no OutboxProcessor + Twilio | DONE |
| **Step 7** | Webhook Inbound WhatsApp + Slot Booking + Cloud Tasks | DONE |
| **Step 8** | Reminder de Confirmação + Fluxo de Declínio | DONE |

---

## Fluxo Completo

```
Talentum POST /api/webhooks/talentum/prescreening
  statusLabel: 'QUALIFIED'
    │
    ▼
ProcessTalentumPrescreening.execute()
  BEGIN TRANSACTION
    → upsertWorkerJobApplication(stage: QUALIFIED)
    → INSERT INTO domain_events (event, payload, status='pending')
  COMMIT
  → pubsub.topic('talentum-prescreening-qualified').publish({ eventId })
    │
    ▼
Pub/Sub push → POST /api/internal/events/process
  → DomainEventProcessor.handle(eventId)
    → QualifiedInterviewHandler:
        busca meet_link_1/2/3 + meet_datetime_1/2/3
        tokeniza nome (TokenService)
        INSERT INTO messaging_outbox
        → pubsub.topic('outbox-enqueued').publish({ outboxId })
    │
    ▼
Pub/Sub push → POST /api/internal/outbox/process
  → OutboxProcessor.processMessage(outboxId)
    → TwilioMessagingService.sendInteractive(contentSid, contentVariables)
    → WhatsApp Interactive Message com 3 botões de horário
    │
    ▼
Worker toca no botão
  → Twilio POST /api/webhooks/twilio/inbound
    │
    ▼
InboundWhatsAppController → BookSlotFromWhatsAppUseCase.execute()
  → identifica worker pelo phone (E.164)
  → mapeia button_payload → meet_link_N da vaga
  → bookSlot() (optimistic lock)
  → GoogleCalendarService.addGuestToMeeting()
  → INSERT confirmação na messaging_outbox → pubsub.publish('outbox-enqueued')
  → salva interview_meet_link + interview_datetime
  → cloudTasks.schedule({                              ← agenda exatamente 24h antes
      queue: 'interview-reminders',
      url: '/api/internal/reminders/qualified',
      body: { workerId, jobPostingId },
      scheduleTime: interview_datetime - 24h
    })
    │
    ▼
Cloud Tasks dispara exatamente 24h antes da entrevista
  → POST /api/internal/reminders/qualified
    → INSERT na messaging_outbox (template interativo Sí/No)
    → pubsub.publish('outbox-enqueued')
    │
    ├── Worker toca "Sí"  → salva interview_response = 'confirmed'
    │
    └── Worker toca "No"
          → cancelSlot()
          → GoogleCalendarService.removeGuestFromMeeting()
          → salva interview_response = 'declined'
          → notifica admin via messaging_outbox
```

---

## Step 1 — Infraestrutura Event-Driven (Pub/Sub + Cloud Tasks) ✅

**Objetivo:** Criar a fundação event-driven que substitui setInterval e n8n. Pub/Sub para reações imediatas, Cloud Tasks para ações agendadas com precisão, Transactional Outbox para consistência. Sem Cloud Scheduler — confiamos no Pub/Sub at-least-once delivery e Cloud Tasks para agendamentos precisos.

### Por que Pub/Sub + Cloud Tasks (não polling)

| Aspecto | setInterval / Cloud Scheduler polling | Pub/Sub + Cloud Tasks |
|---------|--------------------------------------|----------------------|
| 500 workers em dias diferentes | 1440 chamadas/dia (1/min), 99% vazias | 500 chamadas total, 100% úteis |
| Latência evento → ação | Até 60s (espera próximo poll) | ~1-2s (Pub/Sub push) |
| Reminder 24h antes | Poll a cada minuto checando todos os registros | 1 task agendada pro momento exato |
| Custo GCP | Baixo mas constante | Proporcional ao uso real |
| Escala horizontal | Precisa de lock para evitar duplicação | Pub/Sub garante at-least-once delivery |
| Extrair microserviço | Endpoint muda de URL | Subscriber muda, publisher não |

### Topologia

```
Pub/Sub (reação imediata):
  topic: talentum-prescreening-qualified → push → /api/internal/events/process
  topic: outbox-enqueued                → push → /api/internal/outbox/process

Cloud Tasks (ação agendada com precisão):
  queue: interview-reminders → /api/internal/reminders/qualified  (24h antes)
  queue: interview-reminders → /api/internal/reminders/5min       (5min antes)
```

> **Decisão:** Cloud Scheduler foi eliminado. Pub/Sub at-least-once delivery torna safety nets desnecessários. Bulk dispatch (feature independente) será reativado futuramente com trigger próprio.

### Backend

| Arquivo | Ação |
|---------|------|
| `src/infrastructure/events/PubSubClient.ts` | ✅ Wrapper `@google-cloud/pubsub`. Métodos: `publish(topic, data)`, `decodePushMessage(body)` estático. Mock mode sem `GCP_PROJECT_ID` |
| `src/infrastructure/events/CloudTasksClient.ts` | ✅ Wrapper `@google-cloud/tasks`. Métodos: `schedule({ queue, url, body, scheduleTime })`, `deleteTask(taskName)`. Mock mode sem `GCP_PROJECT_ID` |
| `src/infrastructure/events/DomainEventProcessor.ts` | ✅ Recebe eventId, despacha para handler registrado, marca `processed`. Idempotente |
| `src/interfaces/controllers/InternalController.ts` | ✅ Endpoints: `events/process`, `outbox/process`, `reminders/qualified`, `reminders/5min`. Delega para `ReminderScheduler` |
| `src/interfaces/routes/internalRoutes.ts` | ✅ Router `/api/internal/*` com `internalAuthMiddleware` |
| `src/interfaces/middleware/InternalAuthMiddleware.ts` | ✅ Auth dupla: `X-Internal-Secret` (Cloud Tasks) + Bearer OIDC via `google-auth-library` (Pub/Sub push) |
| `src/index.ts` | ✅ Rotas internas registradas. `OutboxProcessor` movido para escopo compartilhado (usado por InternalController) |
| `src/infrastructure/services/OutboxProcessor.ts` | ✅ Adicionado `processById(outboxId)` para processamento unitário via Pub/Sub push. Removido `start()`/`stop()` (polling) |
| `.env.example` | ✅ `INTERNAL_TOKEN_SECRET` (compartilhado com MultiAuthService), `CLOUD_TASKS_QUEUE_LOCATION`, `CLOUD_RUN_SERVICE_URL` |
| `package.json` | ✅ `@google-cloud/pubsub@^5.3.0`, `@google-cloud/tasks@^6.2.1` |

### InternalAuthMiddleware

```typescript
export async function internalAuthMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  // 1. Cloud Tasks: header secreto
  const secret = req.headers['x-internal-secret'];
  if (secret && secret === process.env.INTERNAL_SECRET) {
    return next();
  }

  // 2. Pub/Sub push: Bearer token OIDC
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const isValid = await verifyOidcToken(token);
    if (isValid) return next();
  }

  res.status(403).json({ error: 'Forbidden' });
}
```

### Endpoints internos

| Método | Rota | Trigger | Função |
|--------|------|---------|--------|
| POST | `/api/internal/events/process` | Pub/Sub push (topic: talentum-prescreening-qualified) | DomainEventProcessor — despacha evento ao handler correto |
| POST | `/api/internal/outbox/process` | Pub/Sub push (topic: outbox-enqueued) | OutboxProcessor — envia 1 mensagem via Twilio |
| POST | `/api/internal/reminders/qualified` | Cloud Tasks (agendado 24h antes) | Envia reminder de confirmação para 1 worker |
| POST | `/api/internal/reminders/5min` | Cloud Tasks (agendado 5min antes) | Envia lembrete de 5min para 1 worker |

### Configuração GCP (via gcloud CLI)

```bash
# ── Pub/Sub Topics + Push Subscriptions ──

gcloud pubsub topics create talentum-prescreening-qualified
gcloud pubsub subscriptions create talentum-prescreening-qualified-push \
  --topic=talentum-prescreening-qualified \
  --push-endpoint="https://<domain>/api/internal/events/process" \
  --push-auth-service-account=pubsub-invoker@<project>.iam.gserviceaccount.com \
  --ack-deadline=30

gcloud pubsub topics create outbox-enqueued
gcloud pubsub subscriptions create outbox-push \
  --topic=outbox-enqueued \
  --push-endpoint="https://<domain>/api/internal/outbox/process" \
  --push-auth-service-account=pubsub-invoker@<project>.iam.gserviceaccount.com \
  --ack-deadline=30

# ── Cloud Tasks Queue ──

gcloud tasks queues create interview-reminders \
  --location=southamerica-east1 \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=2 \
  --max-attempts=3 \
  --min-backoff=60s

# ── Cloud Scheduler ──
# REMOVIDO: confiamos no Pub/Sub at-least-once + Cloud Tasks.
# Bulk dispatch será reativado futuramente com trigger próprio.
```

### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `PubSubClient.test.ts` | 5 | Unit — mock mode, publish real, decode válido, missing data, JSON inválido. **100% lines** |
| `CloudTasksClient.test.ts` | 5 | Unit — mock mode, scheduleTime formatado, sem delay, deleteTask mock, deleteTask real. **100% lines** |
| `DomainEventProcessor.test.ts` | 6 | Unit — dispatch correto, event not found, já processado, sem handler, handler throws, sweep órfãos. **100% lines** |
| `InternalAuthMiddleware.test.ts` | 5 | Unit — secret válido, OIDC válido, sem auth 403, secret errado 403, OIDC inválido 403. **100% lines/branches** |
| `InternalController.test.ts` | 21 | Unit — todos os endpoints (happy path + 400 + 500), delegates para ReminderScheduler e BulkDispatchScheduler. **96% lines** |
| `internal-endpoints.e2e.ts` | 7 | E2E — 403 sem auth, 400 com auth, processa evento real, sweeps 200, reminders 200/400, bulk-dispatch 200 |

### Decisões de design

- **Pub/Sub push (não pull):** Push subscriptions chamam nosso endpoint — não precisamos de um consumer rodando. O GCP gerencia retry, backoff e dead-letter. Perfeito para Cloud Run / App Engine.
- **Cloud Tasks para reminders (não Cloud Scheduler):** Reminder 24h antes é por-worker, por-entrevista — não é periódico. Cloud Tasks agenda para data/hora exata. A task fica dormindo sem custo. Cloud Scheduler é cron (periódico) — errado para este caso.
- **Transactional Outbox para domain_events:** Evento é inserido na mesma transação que a mudança de estado. Pub/Sub publica após commit com at-least-once delivery.
- **Auth dupla:** Pub/Sub push usa OIDC token nativo do GCP (mais seguro). Cloud Tasks/Scheduler usam header secreto (mais simples). Em dev/test, header funciona para ambos.
- **Dependências:** `@google-cloud/pubsub` e `@google-cloud/tasks` — SDKs oficiais. Já usamos `@google-cloud/storage` no projeto.

---

## Step 2 — Migration + Templates de Mensagem ✅

**Objetivo:** Criar tabela `domain_events`, colunas de tracking em `worker_job_applications`, e templates de mensagem. Roda antes de qualquer código para garantir que o schema está pronto.

### Backend

| Arquivo | Ação |
|---------|------|
| `migrations/099_event_driven_infrastructure.sql` | ✅ Tabela `domain_events` + 6 colunas interview tracking em `worker_job_applications` + 4 templates de mensagem (`qualified_interview_invite`, `qualified_slot_confirmed`, `qualified_reminder_confirm`, `qualified_declined_admin`) |
| `tests/e2e/setup.ts` | ✅ `domain_events` adicionada à lista de truncate |

### Schema da migration

```sql
-- ══════════════════════════════════════════════════════════════
-- Step 2: Infraestrutura event-driven + tracking entrevista
-- ══════════════════════════════════════════════════════════════

-- ── 1. Tabela domain_events (Transactional Outbox para eventos) ──

CREATE TABLE IF NOT EXISTS domain_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event        TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domain_events_pending
  ON domain_events (created_at)
  WHERE status = 'pending';

-- ── 2. Colunas em worker_job_applications ──

ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS interview_meet_link        TEXT,
  ADD COLUMN IF NOT EXISTS interview_datetime         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_response         TEXT
    CHECK (interview_response IN ('pending', 'confirmed', 'declined', 'no_response')),
  ADD COLUMN IF NOT EXISTS interview_responded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_slot_id          UUID REFERENCES interview_slots(id);

CREATE INDEX IF NOT EXISTS idx_wja_interview_pending
  ON worker_job_applications (interview_datetime)
  WHERE interview_response = 'pending'
    AND interview_datetime IS NOT NULL;

-- ── 3. Templates de mensagem ──

INSERT INTO message_templates (slug, name, body, category, content_sid) VALUES
  ('qualified_interview_invite',
   'Invitación Entrevista Qualified',
   'Hola {{name}}! Felicitaciones, fue preseleccionado/a para una entrevista. Elija el horario que le quede mejor: 1) {{option_1}} 2) {{option_2}} 3) {{option_3}}',
   'recruitment', NULL),
  ('qualified_slot_confirmed',
   'Entrevista Agendada',
   'Hola {{name}}! Su entrevista fue agendada para el {{date}} a las {{time}}. Enlace: {{meet_link}}. ¡Lo esperamos!',
   'recruitment', NULL),
  ('qualified_reminder_confirm',
   'Confirmación 24h antes',
   'Hola {{name}}! Mañana {{date}} a las {{time}} tiene su entrevista. ¿Confirma su asistencia?',
   'notification', NULL),
  ('qualified_declined_admin',
   'Worker declinó entrevista',
   'El worker {{name}} (ID: {{worker_id}}) declinó su entrevista del {{date}} a las {{time}} para la vaga {{vacancy_name}}. El slot fue liberado.',
   'internal', NULL)
ON CONFLICT (slug) DO NOTHING;
```

### Decisões de design

- **Tabela `domain_events`:** Mesma estratégia que `messaging_outbox` — row é inserida na mesma transação que a mudança de estado. Pub/Sub publica após commit com at-least-once delivery.
- **Colunas em `worker_job_applications` (não em `encuadres`):** O fluxo QUALIFIED é por vaga, não por encuadre. A relação canônica é `worker + job_posting`.
- **`content_sid` NULL nos templates:** O template de texto serve como fallback. O `contentSid` é preenchido manualmente após criar o Content Template no Twilio Console (requer aprovação do WhatsApp Business).

---

## Step 3 — Migrar serviços existentes para event-driven ✅

**Objetivo:** Substituir `setInterval` do OutboxProcessor e ReminderScheduler por triggers via Pub/Sub e Cloud Tasks. O código existente (encuadres reminders) continua funcionando com a nova infraestrutura.

### Backend — O que foi feito

| Arquivo | Ação |
|---------|------|
| `src/infrastructure/services/OutboxProcessor.ts` | **REFATORADO** — Removido `setInterval`, `start()`, `stop()`, `timer`. `processById(outboxId)` para processar 1 mensagem via Pub/Sub push |
| `src/infrastructure/services/ReminderScheduler.ts` | **REESCRITO** — Removido polling. `scheduleReminders(slotDatetime, workerId, jobPostingId)` agenda 2 Cloud Tasks (24h + 5min antes), `cancelReminders(taskNames)` para cancelamento, `processQualifiedReminder()` e `process5MinReminder()` para processar 1 reminder individual via Cloud Task |
| `src/infrastructure/services/BulkDispatchScheduler.ts` | **REESCRITO** — Removido `setTimeout`, `setInterval`, `start()`, `stop()`, `msUntilNext()`. Classe reduzida a 33 linhas com método público stateless `run()` chamado via Cloud Scheduler |
| `src/infrastructure/events/CloudTasksClient.ts` | **MODIFICADO** — Adicionado `deleteTask(taskName)` para cancelamento de Cloud Tasks agendados |
| `src/interfaces/controllers/InternalController.ts` | **MODIFICADO** — Construtor agora recebe `ReminderScheduler` e `BulkDispatchScheduler`. Handlers `processQualifiedReminder` e `process5MinReminder` delegam ao ReminderScheduler. `processBulkDispatch` delega ao BulkDispatchScheduler.run() e retorna resultado |
| `src/index.ts` | **MODIFICADO** — Removido `outboxProcessor.start(30_000)` e `reminderScheduler.start(60_000)`. Instancia `CloudTasksClient`, `ReminderScheduler`, `BulkDispatchScheduler` e passa ao `InternalController` |

### Como o OutboxProcessor mudou

```
Antes (polling):
  setInterval(30s) → SELECT * FROM messaging_outbox WHERE status='pending' LIMIT 50
                   → processa batch inteiro

Agora (event-driven):
  INSERT INTO messaging_outbox → pubsub.publish('outbox-enqueued', { outboxId })
                                    │
                                    ▼
  Pub/Sub push → POST /api/internal/outbox/process
               → OutboxProcessor.processById(outboxId)
               → processa apenas aquela mensagem
```

Latência: ~30s (polling) → ~1-2s (Pub/Sub push).

### Como o ReminderScheduler mudou

```
Antes (polling):
  setInterval(60s) → SELECT encuadres WHERE entrevista em 24h AND reminder_sent IS NULL
                   → processa batch

Agora (precisão):
  bookSlot() → reminderScheduler.scheduleReminders(slotDatetime, workerId, jobPostingId)
               → cloudTasks.schedule({
                   url: '/api/internal/reminders/qualified',
                   scheduleTime: slot_datetime - 24h
                 })
               → cloudTasks.schedule({
                   url: '/api/internal/reminders/5min',
                   scheduleTime: slot_datetime - 5min
                 })
               → tasks dormem até o momento exato
               → retorna { taskNames } para eventual cancelamento
```

Zero polling. Cada reminder é 1 task agendada para o timestamp correto.

### Como o BulkDispatchScheduler mudou

```
Antes (timers):
  start() → calcula ms até 10h BRT → setTimeout → setInterval(24h) → run()
  98 linhas, estado interno (timeout + interval)

Agora (stateless):
  Cloud Scheduler (daily 10h BRT) → POST /api/internal/bulk-dispatch/process
                                  → InternalController.processBulkDispatch()
                                  → BulkDispatchScheduler.run()
  33 linhas, sem estado
```

### Safety net

> **Decisão:** Safety nets via Cloud Scheduler (outbox-sweep, events-sweep) foram eliminados. Confiamos no Pub/Sub at-least-once delivery. Os endpoints `/outbox/sweep` e `/events/sweep` permanecem no código para uso manual em caso de incidente, mas não têm trigger automático.

### Testes — Implementados

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `OutboxProcessor.test.ts` | 9 | Unit — processById (sucesso, não existe, idempotente, MAX_ATTEMPTS), processBatch (múltiplas, vazio), edge cases (worker não encontrado, sem telefone), API surface (sem start/stop) |
| `ReminderScheduler.test.ts` | 14 | Unit — scheduleReminders (agenda 2 tasks, calcula scheduleTime, mock mode), cancelReminders (deleta, lista vazia), processQualifiedReminder (insere+marca, vazio), process5MinReminder (insere+marca, vazio), processBatch safety net (24h e 5min), API surface |
| `BulkDispatchScheduler.test.ts` | 3 | Unit — run (sucesso, erro), API surface (sem start/stop/timeout/interval) |
| `CloudTasksClient.test.ts` | 5 | Unit — schedule mock, scheduleTime formatação, sem delay, deleteTask mock e produção |
| `InternalController.test.ts` | 20 | Unit — todos os 7 endpoints (processEvent, processOutbox, sweepOutbox, sweepEvents, processQualifiedReminder, process5MinReminder, processBulkDispatch) com cenários de sucesso, validação de input e tratamento de erro |

**Cobertura:** 100% Statements, 100% Functions, 100% Lines em todos os arquivos.

### Decisões de design

- **processById (1 msg) vs processBatch (N msgs):** Com Pub/Sub, cada publish aciona 1 chamada ao endpoint. Processamos 1 mensagem por request. Isso é mais simples, melhor para observability (1 request = 1 mensagem = 1 log), e escala naturalmente.
- **Encuadres reminders existentes:** Os reminders da migration 095 (encuadre_reminder_day_before, encuadre_reminder_5min) migram para Cloud Tasks. Quando `InterviewSchedulingService.bookSlot()` é chamado, agenda 2 tasks (24h + 5min).
- **scheduleReminders retorna taskNames:** Permite cancelamento posterior via `cancelReminders(taskNames)` quando um slot é cancelado. CloudTasksClient.deleteTask() envia DELETE ao GCP.

---

## Step 4 — Emitir evento no QUALIFIED (Transactional Outbox + Pub/Sub) ✅

**Objetivo:** No ponto exato onde o Talentum seta `application_funnel_stage = QUALIFIED`, inserir evento na `domain_events` (mesma transação) e publicar no Pub/Sub.

### Backend — O que foi feito

| Arquivo | Ação |
|---------|------|
| `src/application/usecases/ProcessTalentumPrescreening.ts` | **MODIFICADO** — Recebe `PubSubClient` + `Pool` no construtor (5 dependências). Novo método privado `upsertApplicationAndEmitEvent()` encapsula a transação: upsert da application + INSERT em `domain_events` se transitou para QUALIFIED + publish Pub/Sub após commit |
| `src/interfaces/webhooks/controllers/TalentumWebhookController.ts` | **MODIFICADO** — Instancia `PubSubClient` e passa `pool` + `pubsub` ao construtor do use case |
| `src/infrastructure/repositories/TalentumPrescreeningRepository.ts` | **MODIFICADO** — `upsertWorkerJobApplicationFromTalentum()` agora aceita `client?: { query: Pool['query'] }` para executar dentro de uma transação existente. Retorna `{ previousStage: string | null }` via CTE SQL (`WITH previous AS (SELECT application_funnel_stage ...)`) |

### Lógica de emissão — Como implementada

```typescript
// Em ProcessTalentumPrescreening.upsertApplicationAndEmitEvent()

const client = await this.pool.connect();
try {
  await client.query('BEGIN');

  // 1. Upsert da application (retorna previousStage via CTE SQL)
  const { previousStage } = await this.prescreeningRepo.upsertWorkerJobApplicationFromTalentum(
    { workerId, jobPostingId, applicationFunnelStage: statusLabel, matchScore },
    client,  // usa a mesma conexão/transação
  );

  let pendingEventId: string | null = null;

  // 2. Se transitou para QUALIFIED, inserir domain_event na mesma transação
  if (statusLabel === 'QUALIFIED' && previousStage !== 'QUALIFIED') {
    const eventResult = await client.query(
      `INSERT INTO domain_events (event, payload)
       VALUES ('funnel_stage.qualified', $1::jsonb)
       RETURNING id`,
      [JSON.stringify({ workerId, jobPostingId })],
    );
    pendingEventId = eventResult.rows[0].id;
  }

  await client.query('COMMIT');

  // 3. Publish no Pub/Sub APÓS commit (at-least-once delivery)
  if (pendingEventId) {
    await this.pubsub.publish('talentum-prescreening-qualified', { eventId: pendingEventId });
  }
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

### SQL do repositório — CTE para capturar previousStage

```sql
WITH previous AS (
  SELECT application_funnel_stage
  FROM worker_job_applications
  WHERE worker_id = $1 AND job_posting_id = $2
)
INSERT INTO worker_job_applications (...)
VALUES (...)
ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET ...
RETURNING (SELECT application_funnel_stage FROM previous) AS previous_stage
```

O CTE captura o stage **antes** do INSERT/UPDATE — permite detectar transições como `SCREENED → QUALIFIED` ou `null → QUALIFIED` (primeira application).

### Testes — Implementados

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `ProcessTalentumPrescreening.test.ts` | 17 | Unit — insere domain_event ao transitar para QUALIFIED, não insere se já era QUALIFIED (deduplicação), não insere para NOT_QUALIFIED, não insere para IN_DOUBT, não insere em dryRun, publica no Pub/Sub com eventId após commit, faz rollback se INSERT falhar, não tenta emitir se status ≠ ANALYZED, trata previousStage null como transição, upsertQuestions para registerQuestions e response.state, resolveWorkerId fallback (email→phone→cuil→null), extractId com isSuccess=false, resolveJobPostingId em exceção, responseType vazio, answer vazia |

**Cobertura:** 100% Statements, 100% Functions, 100% Lines.

### Decisões de design

- **INSERT na transação, publish após commit:** Garante consistência. Se a transação faz rollback, o evento não existe. Pub/Sub at-least-once delivery garante entrega.
- **Deduplicação por `previousStage`:** Webhook do Talentum pode chegar duplicado. Sem checar stage anterior, enviaríamos WhatsApp duplicado. `null !== 'QUALIFIED'` trata corretamente a primeira application.
- **Evento emitido no use case, não no controller:** Lógica de negócio na camada correta (application layer).
- **Variável local `pendingEventId` em vez de `this.pendingEventId`:** Evita estado compartilhado entre chamadas concorrentes. Cada execução tem seu próprio eventId.
- **CTE SQL para previousStage:** Captura o valor anterior atomicamente na mesma query do upsert. Sem race conditions — o CTE roda antes do INSERT/UPDATE.
- **client opcional no repositório:** `client?: { query: Pool['query'] }` permite usar tanto `Pool` (chamada isolada) quanto `PoolClient` (transação). Padrão flexível que não quebra chamadas existentes.

---

## Step 5 — QualifiedInterviewHandler (Pub/Sub push) ✅

**Objetivo:** Handler que reage ao evento `funnel_stage.qualified` e enfileira a mensagem WhatsApp interativa com os 3 horários da vaga.

### Backend

| Arquivo | Ação |
|---------|------|
| `src/infrastructure/events/handlers/QualifiedInterviewHandler.ts` | ✅ Factory function `createQualifiedInterviewHandler(db, pubsub, tokenService)` — retorna `DomainEventHandler` |
| `src/index.ts` | ✅ Registra handler via `domainEventProcessor.registerHandler('funnel_stage.qualified', handler)` |

### Lógica do handler

```typescript
// QualifiedInterviewHandler.handle()

// 1. Buscar meet links da vaga
const vacancy = await jobPostingRepo.findById(event.payload.jobPostingId);
if (!vacancy.meet_link_1 || !vacancy.meet_datetime_1) {
  logger.warn('Vaga sem meet links configurados, pulando envio');
  return;
}

// 2. Buscar worker e tokenizar nome
const worker = await workerRepo.findById(event.payload.workerId);
const nameToken = await tokenService.generate(worker.id, 'first_name');

// 3. Formatar opções (ex: "Lun 07/04 10:00")
const options = [
  formatSlotOption(vacancy.meet_datetime_1),
  formatSlotOption(vacancy.meet_datetime_2),
  formatSlotOption(vacancy.meet_datetime_3),
].filter(Boolean);

// 4. Inserir na messaging_outbox + publish Pub/Sub
const outboxId = await outboxRepo.insert({
  worker_id: worker.id,
  template_slug: 'qualified_interview_invite',
  variables: {
    name: nameToken,
    option_1: options[0],
    option_2: options[1],
    option_3: options[2],
    job_posting_id: vacancy.id,
  },
  status: 'pending',
});
await pubsub.publish('outbox-enqueued', { outboxId });

// 5. Marcar interview_response = 'pending'
await wjaRepo.updateInterviewStatus(worker.id, vacancy.id, {
  interview_response: 'pending',
});
```

### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `QualifiedInterviewHandler.test.ts` | 12 | Unit — enfileira msg com 3 opções, pula se sem meet links, pula se vaga/worker não encontrado, tokeniza nome, publica outbox-enqueued, marca interview_response pending, opções parciais (1/2 links), formatSlotOption (4 cenários). **100% lines** |

### Decisões de design

- **Guard clause se sem meet links:** Handler loga warning e não envia. Admin verá no log que esqueceu de configurar links.
- **`job_posting_id` nas variables:** Quando o worker responder, o InboundController precisa saber de qual vaga são os slots. Guardamos no JSONB.
- **Pub/Sub após insert na outbox:** Garante que a mensagem é processada imediatamente (~1-2s) em vez de esperar polling.

---

## Step 6 — Interactive Messages no OutboxProcessor + Twilio ✅

**Objetivo:** Estender o OutboxProcessor e TwilioMessagingService para enviar WhatsApp Interactive Messages via Twilio Content API.

### Backend

| Arquivo | Ação |
|---------|------|
| `src/infrastructure/services/TwilioMessagingService.ts` | ✅ Método `sendWithContentSid(to, contentSid, contentVariables)` + `mapToContentVariables(body, vars)`. `sendWhatsApp()` auto-mapeia variáveis para posicionais quando contentSid presente |
| `src/domain/ports/IMessagingService.ts` | ✅ Interface estendida com `sendWithContentSid` |
| `src/infrastructure/repositories/MessageTemplateRepository.ts` | ✅ Verificado: `findBySlug()` já retorna `content_sid` |

### Twilio Content API

```typescript
// TwilioMessagingService.sendWithContentSid()
const message = await this.client.messages.create({
  from: `whatsapp:${this.fromNumber}`,
  to: `whatsapp:${toE164}`,
  contentSid: contentSid,           // HXxxxxx do Twilio Console
  contentVariables: JSON.stringify({ // Variáveis mapeadas por posição
    '1': resolvedVariables.name,
    '2': resolvedVariables.option_1,
    '3': resolvedVariables.option_2,
    '4': resolvedVariables.option_3,
  }),
  statusCallback: this.statusCallbackUrl,
});
```

### Twilio Console (manual, fora do código)

Criar Content Template no Twilio Console com:
- **Type:** `twilio/quick-reply` (botões)
- **Body:** `Hola {{1}}! Felicitaciones, fue preseleccionado/a. Elija su horario de entrevista:`
- **Botões:** `{{2}}`, `{{3}}`, `{{4}}` (resolvidos para datas formatadas)
- Após aprovação do WhatsApp Business → copiar `contentSid` (HXxxxxx) para `message_templates.content_sid`

### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `TwilioMessagingService.test.ts` | 24 | Unit — sendWhatsApp (free-form, Content API, contentVariables, edge cases), sendWithContentSid (4 cenários), normalizeNumber (7 cenários), mapToContentVariables (4 cenários). **100% stmts/lines** |

### Decisões de design

- **Content API vs. free-form:** Interactive Messages (botões) só funcionam via Content API do Twilio. O `contentSid` é obrigatório para botões.
- **Fallback para free-form:** Se `content_sid` for NULL (template ainda não aprovado no Twilio), envia como texto simples com opções numeradas.
- **Content variables por posição:** Twilio Content API usa `{"1": "...", "2": "..."}` em vez de nomes. Mapeamento feito automaticamente por `mapToContentVariables()` no TwilioMessagingService — extrai `{{placeholders}}` do body na ordem de aparição e atribui chaves posicionais.
- **OutboxProcessor sem mudanças:** `sendWhatsApp()` já resolve contentSid internamente (lookup no template). A adição de `contentVariables` é transparente — o caller (OutboxProcessor) continua passando variáveis nomeadas e o TwilioMessagingService converte automaticamente.

---

## Step 7 — Webhook Inbound WhatsApp + Slot Booking + Cloud Tasks ✅

**Objetivo:** Receber resposta do worker via Twilio, reservar slot, adicionar ao Google Calendar, e agendar Cloud Tasks para reminders no momento exato.

### Backend

| Arquivo | Ação |
|---------|------|
| `src/interfaces/webhooks/controllers/InboundWhatsAppController.ts` | ✅ Recebe POST do Twilio com resposta do worker. Roteamento por `ButtonPayload` + `template_slug` |
| `src/application/use-cases/BookSlotFromWhatsAppUseCase.ts` | ✅ Orquestra booking + calendar + agenda Cloud Tasks (24h + 5min) |
| `src/interfaces/webhooks/routes/webhookRoutes.ts` | ✅ `POST /api/webhooks/twilio/inbound` registrado |

### InboundWhatsAppController

```typescript
// POST /api/webhooks/twilio/inbound

async handleInbound(req: Request, res: Response): Promise<void> {
  // 1. Validar assinatura Twilio
  if (!this.validateTwilioSignature(req)) {
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  // 2. Extrair dados
  const from = req.body.From;               // whatsapp:+5491112345678
  const buttonPayload = req.body.ButtonPayload; // "slot_1" | "confirm_yes" | "confirm_no"

  // 3. Rotear por tipo de resposta
  if (buttonPayload?.startsWith('slot_')) {
    await this.bookSlotUseCase.execute(from, buttonPayload);
  } else if (buttonPayload?.startsWith('confirm_')) {
    await this.handleReminderResponseUseCase.execute(from, buttonPayload);
  } else {
    logger.info('Inbound message ignored (not a button response)', { from });
  }

  // 4. Twilio espera 200 OK
  res.status(200).send();
}
```

### BookSlotFromWhatsAppUseCase

```typescript
async execute(fromPhone: string, buttonPayload: string): Promise<Result<void>> {
  // 1. Identificar worker
  const phone = this.normalizePhone(fromPhone);
  const worker = await this.workerRepo.findByPhone(phone);
  if (!worker) return Result.fail('Worker not found');

  // 2. Buscar application pendente
  const application = await this.wjaRepo.findPendingInterview(worker.id);
  if (!application) return Result.fail('No pending interview');

  // 3. Mapear button → meet_link
  const slotIndex = parseInt(buttonPayload.replace('slot_', ''));
  const vacancy = await this.jobPostingRepo.findById(application.jobPostingId);
  const meetLink = vacancy[`meet_link_${slotIndex}`];
  const meetDatetime = vacancy[`meet_datetime_${slotIndex}`];
  if (!meetLink || !meetDatetime) return Result.fail('Invalid slot');

  // 4. Booking
  const slot = await this.interviewSlotRepo.bookSlot({
    jobPostingId: application.jobPostingId,
    meetLink,
    slotDate: meetDatetime,
  });

  // 5. Google Calendar
  await this.googleCalendarService.addGuestToMeeting(meetLink, worker.email);

  // 6. Atualizar worker_job_applications
  await this.wjaRepo.updateInterviewStatus(worker.id, application.jobPostingId, {
    interview_meet_link: meetLink,
    interview_datetime: meetDatetime,
    interview_slot_id: slot.id,
    interview_response: 'pending',
  });

  // 7. Confirmação WhatsApp
  const nameToken = await this.tokenService.generate(worker.id, 'first_name');
  const outboxId = await this.outboxRepo.insert({
    worker_id: worker.id,
    template_slug: 'qualified_slot_confirmed',
    variables: { name: nameToken, date: formatDate(meetDatetime), time: formatTime(meetDatetime), meet_link: meetLink },
    status: 'pending',
  });
  await this.pubsub.publish('outbox-enqueued', { outboxId });

  // 8. Agendar reminders via Cloud Tasks (momento exato)
  const interviewDate = new Date(meetDatetime);

  await this.cloudTasks.schedule({
    queue: 'interview-reminders',
    url: '/api/internal/reminders/qualified',
    body: { workerId: worker.id, jobPostingId: application.jobPostingId },
    scheduleTime: new Date(interviewDate.getTime() - 24 * 60 * 60 * 1000), // 24h antes
  });

  await this.cloudTasks.schedule({
    queue: 'interview-reminders',
    url: '/api/internal/reminders/5min',
    body: { workerId: worker.id, jobPostingId: application.jobPostingId },
    scheduleTime: new Date(interviewDate.getTime() - 5 * 60 * 1000),       // 5min antes
  });

  return Result.ok();
}
```

**Endpoints criados:**

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/webhooks/twilio/inbound` | Recebe respostas do worker via WhatsApp (botões interativos) |

### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `InboundWhatsAppController.test.ts` | 4 | Unit — valida signature, roteia slot, roteia confirm, ignora texto livre |
| `BookSlotFromWhatsAppUseCase.test.ts` | 7 | Unit — identifica worker, mapeia slot, booking, add guest, enfileira confirmação, agenda 2 Cloud Tasks (24h + 5min), worker not found |
| `inbound-whatsapp.e2e.ts` | 5 | E2E — fluxo completo slot_1/2/3, assinatura inválida, worker inexistente |

### Decisões de design

- **Cloud Tasks no booking (não polling):** O momento do reminder é conhecido no ato do booking. `interview_datetime - 24h` e `- 5min` são calculados e agendados como Cloud Tasks. Zero polling.
- **ButtonPayload como contrato:** `slot_1`, `slot_2`, `slot_3`, `confirm_yes`, `confirm_no` são definidos no Content Template do Twilio. É o contrato entre WhatsApp e backend.
- **Roteamento por prefixo:** `slot_*` → booking, `confirm_*` → reminder response. Extensível: `reschedule_*` no futuro sem mudar o controller.

---

## Step 8 — Reminder de Confirmação + Fluxo de Declínio ✅

**Objetivo:** Cloud Tasks dispara 24h antes da entrevista. Worker recebe mensagem interativa (Sí/No). Se declinar: libera slot, remove do Calendar, notifica admin.

### Backend

| Arquivo | Ação |
|---------|------|
| `src/interfaces/controllers/InternalController.ts` | ✅ Endpoint `reminders/qualified` delega ao `ReminderScheduler` com idempotência |
| `src/application/use-cases/HandleReminderResponseUseCase.ts` | ✅ Processa confirm/decline com state machine, Calendar removal, notificação admin |
| `src/infrastructure/services/GoogleCalendarService.ts` | ✅ `removeGuestFromMeeting(meetLink, email)` implementado (idempotente, mock mode) |
| `src/domain/entities/InterviewStateMachine.ts` | ✅ Transições válidas: pending→confirmed, pending→declined, confirmed→declined |

### Endpoint /api/internal/reminders/qualified

```typescript
// Chamado pelo Cloud Tasks exatamente 24h antes da entrevista

async processQualifiedReminder(req: Request, res: Response): Promise<void> {
  const { workerId, jobPostingId } = req.body;

  const application = await this.wjaRepo.findByWorkerAndJob(workerId, jobPostingId);

  // Idempotência: já enviou ou worker já respondeu
  if (application.interview_reminder_sent_at || application.interview_response !== 'pending') {
    res.status(200).json({ skipped: true });
    return;
  }

  // Inserir reminder na outbox
  const nameToken = await this.tokenService.generate(workerId, 'first_name');
  const outboxId = await this.outboxRepo.insert({
    worker_id: workerId,
    template_slug: 'qualified_reminder_confirm',
    variables: {
      name: nameToken,
      date: formatDate(application.interview_datetime),
      time: formatTime(application.interview_datetime),
    },
    status: 'pending',
  });
  await this.pubsub.publish('outbox-enqueued', { outboxId });

  // Marcar como enviado
  await this.wjaRepo.updateInterviewStatus(workerId, jobPostingId, {
    interview_reminder_sent_at: new Date(),
  });

  res.status(200).json({ sent: true });
}
```

### InterviewStateMachine

```typescript
// domain/entities/InterviewStateMachine.ts

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'declined'],
  confirmed: ['declined'],        // pode cancelar depois de confirmar
  declined:  [],                   // estado final
};

export function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### HandleReminderResponseUseCase

```typescript
async execute(fromPhone: string, buttonPayload: string): Promise<Result<void>> {
  const phone = this.normalizePhone(fromPhone);
  const worker = await this.workerRepo.findByPhone(phone);
  if (!worker) return Result.fail('Worker not found');

  const application = await this.wjaRepo.findPendingInterview(worker.id);
  if (!application) return Result.fail('No pending interview');

  if (buttonPayload === 'confirm_yes') {
    if (!canTransition(application.interview_response, 'confirmed')) {
      return Result.fail('Invalid transition');
    }
    await this.wjaRepo.updateInterviewStatus(worker.id, application.jobPostingId, {
      interview_response: 'confirmed',
      interview_responded_at: new Date(),
    });
    return Result.ok();
  }

  if (buttonPayload === 'confirm_no') {
    if (!canTransition(application.interview_response, 'declined')) {
      return Result.fail('Invalid transition');
    }

    // 1. Liberar slot
    if (application.interview_slot_id) {
      await this.interviewSlotRepo.cancelBooking(application.interview_slot_id);
    }

    // 2. Remover do Google Calendar
    if (application.interview_meet_link && worker.email) {
      await this.googleCalendarService.removeGuestFromMeeting(
        application.interview_meet_link, worker.email,
      );
    }

    // 3. Salvar resposta
    await this.wjaRepo.updateInterviewStatus(worker.id, application.jobPostingId, {
      interview_response: 'declined',
      interview_responded_at: new Date(),
      interview_meet_link: null,
      interview_datetime: null,
      interview_slot_id: null,
    });

    // 4. Notificar admin
    const nameToken = await this.tokenService.generate(worker.id, 'first_name');
    const vacancy = await this.jobPostingRepo.findById(application.jobPostingId);
    const outboxId = await this.outboxRepo.insert({
      worker_id: worker.id,
      template_slug: 'qualified_declined_admin',
      variables: {
        name: nameToken,
        worker_id: worker.id,
        date: formatDate(application.interview_datetime),
        time: formatTime(application.interview_datetime),
        vacancy_name: vacancy.title,
      },
      status: 'pending',
    });
    await this.pubsub.publish('outbox-enqueued', { outboxId });

    return Result.ok();
  }

  return Result.fail('Unknown button payload');
}
```

### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `InterviewStateMachine.test.ts` | 4 | Unit — pending→confirmed, pending→declined, confirmed→declined, declined→* bloqueado |
| `HandleReminderResponseUseCase.test.ts` | 6 | Unit — confirma, declina completo (slot + calendar + admin), worker not found, no pending, transição inválida, idempotente |
| `InternalController.reminders.test.ts` | 3 | Unit — envia reminder, idempotente (já enviou), idempotente (já respondeu) |
| `qualified-interview-flow.e2e.ts` | 8 | E2E — fluxo completo happy path + declínio com cleanup |

### Decisões de design

- **Cloud Tasks (não polling):** O reminder é agendado no momento do booking para `interview_datetime - 24h`. A task fica dormindo sem custo até o momento exato. Zero queries periódicas.
- **State machine explícita:** Transições de `interview_response` são validadas antes de executar. Impede transições inválidas (ex: `declined → pending`).
- **Idempotência no endpoint do reminder:** Se Cloud Tasks fizer retry (falha de rede), o endpoint checa `interview_reminder_sent_at` e `interview_response` antes de reenviar.

---

## Infraestrutura reutilizada (não reconstruir)

| Componente | Arquivo | Papel neste fluxo |
|------------|---------|-------------------|
| TwilioMessagingService | `src/infrastructure/services/TwilioMessagingService.ts` | Envio WhatsApp (estendido para Content API) |
| TokenService | `src/infrastructure/services/TokenService.ts` | Tokeniza PII (nome do worker) |
| InterviewSlotRepository | `src/infrastructure/repositories/InterviewSlotRepository.ts` | Booking com optimistic lock |
| GoogleCalendarService | `src/infrastructure/services/GoogleCalendarService.ts` | addGuestToMeeting (estendido com removeGuest) |
| TwilioWebhookController | `src/interfaces/webhooks/controllers/TwilioWebhookController.ts` | Padrão de validação de signature reutilizado |
| MessageTemplateRepository | `src/infrastructure/repositories/MessageTemplateRepository.ts` | CRUD de templates com content_sid |
| Vacancy Meet Links | `migrations/098_vacancy_meet_links.sql` | meet_link_1/2/3 + meet_datetime_1/2/3 já existem |

---

## Configuração Twilio (manual, fora do código)

| Ação | Onde | Detalhes |
|------|------|----------|
| Criar Content Template "Interview Invite" | Twilio Console → Content Template Builder | Type: `twilio/quick-reply`, 3 botões com payloads `slot_1`, `slot_2`, `slot_3` |
| Criar Content Template "Confirm Reminder" | Twilio Console → Content Template Builder | Type: `twilio/quick-reply`, 2 botões: `confirm_yes`, `confirm_no` |
| Configurar Inbound Webhook URL | Twilio Console → WhatsApp Sender → Webhook | URL: `https://<domain>/api/webhooks/twilio/inbound` |
| Copiar contentSid para banco | `UPDATE message_templates SET content_sid = 'HXxxxxx' WHERE slug = '...'` | Após aprovação do template |

---

## Cobertura de Testes (projetada)

### Testes Unitários (57 novos)

| Suite | Testes | Cobertura |
|-------|--------|-----------|
| `PubSubClient.test.ts` | 3 | Publish, retry, serialização |
| `CloudTasksClient.test.ts` | 3 | Schedule com delay, imediato, formato timestamp |
| `DomainEventProcessor.test.ts` | 4 | Despacha handler, ignora processado, marca processed, handler not found |
| `InternalAuthMiddleware.test.ts` | 3 | Secret válido, OIDC válido, inválidos 403 |
| `OutboxProcessor.test.ts` | 4 | processMessage individual, not found, idempotente, retry |
| `ReminderScheduler.test.ts` | 3 | Agenda Cloud Task, calcula scheduleTime, cancela task |
| `ProcessTalentumPrescreening.test.ts` | 5 | domain_event transacional, dedup, outros stages, dryRun, Pub/Sub publish |
| `QualifiedInterviewHandler.test.ts` | 5 | Enfileira msg, sem meet links, sem phone, tokeniza, publica outbox |
| `OutboxProcessor.content.test.ts` | 3 | ContentSid, fallback freeform, variables |
| `TwilioMessagingService.test.ts` | 2 | sendWithContentSid, content variables |
| `InboundWhatsAppController.test.ts` | 4 | Signature, roteia slot, roteia confirm, ignora texto |
| `BookSlotFromWhatsAppUseCase.test.ts` | 7 | Worker, slot, booking, calendar, outbox, 2 Cloud Tasks, not found |
| `InterviewStateMachine.test.ts` | 4 | pending→confirmed, pending→declined, confirmed→declined, declined bloqueado |
| `HandleReminderResponseUseCase.test.ts` | 6 | Confirma, declina completo, not found, no pending, transição inválida, idempotente |
| `InternalController.reminders.test.ts` | 3 | Envia reminder, idempotente já enviou, idempotente já respondeu |

### Testes E2E (16 novos)

| Suite | Testes | Cobertura |
|-------|--------|-----------|
| `internal-endpoints.e2e.ts` | 3 | Auth protegido, processa evento, retorna 200 |
| `inbound-whatsapp.e2e.ts` | 5 | Fluxo slot_1/2/3, assinatura inválida, worker inexistente |
| `qualified-interview-flow.e2e.ts` | 8 | Happy path completo + declínio com cleanup |

---

## Ordem de Execução

```
Step 1 (Pub/Sub + Cloud Tasks) ──┐
                                 ├──→ Step 3 (migrar serviços) ──→ Step 4 (emit QUALIFIED) ──→ Step 5 (Handler) ──┐
Step 2 (Migration + Templates) ──┤                                                                                ├──→ Step 7 (Inbound + Booking + Tasks) ──→ Step 8 (Reminder + Decline)
                                 └──→ Step 6 (Interactive Messages) ──────────────────────────────────────────────┘
```

- **Steps 1 e 2** são independentes — rodam em paralelo (fundação)
- **Step 3** depende de 1 (precisa do Pub/Sub + Cloud Tasks client)
- **Step 4** depende de 2 e 3 (precisa da tabela domain_events + PubSubClient)
- **Step 5** depende de 4 (precisa do evento sendo emitido)
- **Step 6** depende de 2 (precisa dos templates) — independente de 3/4/5
- **Step 7** depende de 5 e 6 (precisa do handler + interactive messages)
- **Step 8** depende de 7 (precisa do inbound webhook para rotear respostas)

### Caminho crítico

```
Step 1 → Step 3 → Step 4 → Step 5 → Step 7 → Step 8
```

Steps 2 e 6 rodam em paralelo sem bloquear o caminho crítico, desde que estejam prontos antes de Step 4 (para 2) e Step 7 (para 6).
