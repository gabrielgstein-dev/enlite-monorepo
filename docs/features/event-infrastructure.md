# Infraestrutura de Eventos (EVT)

## O que e

Camada de processamento assincrono baseada em Pub/Sub, Cloud Tasks e Cloud Scheduler. Implementa o padrao Transactional Outbox para garantir entrega confiavel de mensagens e eventos, com mecanismos de retry e sweep para eventos orfaos.

## Por que existe

Operacoes criticas (envio de WhatsApp, processamento de webhooks, lembretes) nao podem depender de processamento sincrono — falhas de rede ou timeouts causariam perda de dados. O outbox pattern garante que mensagens sao persistidas atomicamente com a transacao de negocio e processadas de forma confiavel.

## Como funciona

### Transactional Outbox Pattern

```
Transacao de negocio
  |  INSERT INTO outbox_messages (...) -- atomico com mudanca de dominio
  |  COMMIT
  v
OutboxProcessor (trigger via Pub/Sub)
  |  POST /api/internal/outbox/process
  |  Le mensagem do outbox
  |  Processa (envia WhatsApp, notifica, etc.)
  |  Marca como processada
  v
Sweep (Cloud Scheduler — safety net)
  |  POST /api/internal/outbox/sweep
  |  Busca mensagens nao processadas apos threshold
  |  Reprocessa
```

### Domain Events

```
Acao de dominio (ex: worker criado)
  |  EventDispatcher.publish("worker.created", payload)
  |  Publica no Pub/Sub topic "domain-events"
  v
DomainEventProcessor (trigger via Pub/Sub push)
  |  POST /api/internal/events/process
  |  Roteia evento para handler correto
  |  Marca como processado
  v
Sweep (Cloud Scheduler)
  |  POST /api/internal/events/sweep
  |  Reprocessa eventos orfaos
```

### Scheduled Jobs

```
Cloud Scheduler
  |
  |-- 10h BRT --> POST /api/internal/bulk-dispatch/process
  |               (Bulk dispatch diario para workers incompletos)
  |
  |-- Periodico --> POST /api/internal/outbox/sweep
  |                 (Safety net outbox)
  |
  |-- Periodico --> POST /api/internal/events/sweep
                    (Safety net eventos)

Cloud Tasks
  |
  |-- Agendado --> POST /api/internal/reminders/qualified
  |               (Lembrete 24h antes da entrevista)
  |
  |-- Agendado --> POST /api/internal/reminders/5min
                   (Lembrete 5min antes da entrevista)
```

### Autenticacao Interna

Endpoints `/api/internal/*` sao protegidos por `InternalAuthMiddleware`:
- **Producao**: OIDC token do Cloud Scheduler/Tasks/Pub/Sub
- **Dev/E2E**: Shared secret via header `X-Internal-Secret`

## Endpoints

| Metodo | Rota | Trigger | Funcao |
|--------|------|---------|--------|
| POST | `/api/internal/events/process` | Pub/Sub push | Processar evento de dominio |
| POST | `/api/internal/events/sweep` | Cloud Scheduler | Reprocessar eventos orfaos |
| POST | `/api/internal/outbox/process` | Pub/Sub push | Processar mensagem do outbox |
| POST | `/api/internal/outbox/sweep` | Cloud Scheduler | Reprocessar outbox orfao |
| POST | `/api/internal/reminders/qualified` | Cloud Tasks | Lembrete 24h |
| POST | `/api/internal/reminders/5min` | Cloud Tasks | Lembrete 5min |
| POST | `/api/internal/bulk-dispatch/process` | Cloud Scheduler | Bulk dispatch diario |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/InternalController.ts` | Handlers internos |
| `src/interfaces/middleware/InternalAuthMiddleware.ts` | Auth OIDC / shared secret |
| `src/interfaces/routes/internalRoutes.ts` | Rotas internas |
| `src/infrastructure/services/OutboxProcessor.ts` | Processador de outbox |
| `src/infrastructure/services/ReminderScheduler.ts` | Lembretes de entrevista |
| `src/infrastructure/services/BulkDispatchScheduler.ts` | Bulk dispatch diario |
| `src/infrastructure/events/DomainEventProcessor.ts` | Processador de eventos |
| `src/infrastructure/events/PubSubClient.ts` | Cliente Pub/Sub |
| `src/infrastructure/events/EventDispatcher.ts` | Publicador de eventos |

## Regras de negocio

### Outbox
- Mensagens criadas na MESMA transacao que a mudanca de dominio (atomicidade)
- Processamento assincrono apos commit
- Retry built-in para falhas transientes
- Sweep pega mensagens nao processadas apos threshold de tempo

### Eventos
- Topic Pub/Sub: "domain-events"
- Eventos marcados como processados apos sucesso
- Sweep como safety net para eventos perdidos
- Handlers roteados por tipo de evento

### Lembretes
- 24h antes: Envia WhatsApp com detalhes da entrevista
- 5min antes: Envia lembrete final
- Apenas para workers com encuadres confirmados
- Inclui: data, hora, meet link, contato do coordenador

### Bulk Dispatch
- Executa as 10h BRT (Cloud Scheduler)
- Template: "complete_register_ofc"
- Filtra: workers com encuadres positivos + cadastro incompleto
- Attribution: triggered_by=system
- Deduplicacao por worker_id

### Auth Interna
- Producao: OIDC token verificado (Cloud Scheduler/Tasks/Pub/Sub sao os unicos chamadores)
- Dev/E2E: Header `X-Internal-Secret` com valor compartilhado
- Nenhum endpoint interno acessivel sem autenticacao

## Integracoes externas

- **Google Cloud Pub/Sub**: Fila de eventos e outbox
- **Google Cloud Tasks**: Agendamento de lembretes
- **Google Cloud Scheduler**: Jobs recorrentes (bulk dispatch, sweeps)
- **Twilio**: Envio de mensagens (downstream do outbox)
