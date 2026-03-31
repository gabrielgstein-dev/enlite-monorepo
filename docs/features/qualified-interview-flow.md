# Fluxo Qualified → Entrevista via WhatsApp (QIF)

## O que e

Automacao end-to-end do agendamento de entrevistas para workers aprovados no pre-screening. Quando o Talentum marca um worker como QUALIFIED, o sistema envia automaticamente uma mensagem WhatsApp interativa com 3 horarios de entrevista. O worker escolhe tocando um botao, e automaticamente adicionado ao Google Calendar, e recebe um lembrete 24h antes perguntando se confirma. Se declinar, o slot e liberado e o admin e notificado.

## Por que existe

O fluxo anterior era manual: admin recebia notificacao de QUALIFIED, entrava em contato com o worker por WhatsApp, negociava horario, criava convite no Calendar e agendava lembrete manualmente. Com dezenas de workers sendo qualificados por semana, esse processo manual causava atrasos de dias entre a aprovacao e a entrevista, perda de candidatos por falta de follow-up, e nenhuma rastreabilidade.

## Como funciona

### Fluxo completo

```
Talentum marca worker como QUALIFIED
  |  POST /api/webhooks/talentum/prescreening (statusLabel: QUALIFIED)
  v
ProcessTalentumPrescreening
  |  BEGIN TRANSACTION
  |    upsert worker_job_application (stage: QUALIFIED)
  |    INSERT INTO domain_events (funnel_stage.qualified)
  |  COMMIT
  |  Pub/Sub publish → topic "domain-events"
  v
DomainEventProcessor (Pub/Sub push)
  |  POST /api/internal/events/process
  |  Roteia para QualifiedInterviewHandler
  v
QualifiedInterviewHandler
  |  Busca meet_link_1/2/3 da vaga
  |  Tokeniza nome do worker (PII)
  |  INSERT INTO messaging_outbox (template interativo, 3 botoes)
  |  Pub/Sub publish → topic "outbox-enqueued"
  v
OutboxProcessor (Pub/Sub push)
  |  POST /api/internal/outbox/process
  |  Envia WhatsApp Interactive Message via Twilio Content API
  |  Worker recebe: "Escolha seu horario" [Btn1] [Btn2] [Btn3]
  v
Worker toca no botao
  |  Twilio POST /api/webhooks/twilio/inbound
  v
InboundWhatsAppController
  |  Valida X-Twilio-Signature
  |  Roteia por prefixo: slot_* → BookSlotFromWhatsAppUseCase
  v
BookSlotFromWhatsAppUseCase
  |  Identifica worker pelo phone (E.164)
  |  Mapeia button_payload → meet_link_N da vaga
  |  bookSlot() com optimistic lock
  |  GoogleCalendarService.addGuestToMeeting()
  |  Envia confirmacao WhatsApp: "Agendado para dd/mm as HH:mm"
  |  Agenda 2 Cloud Tasks:
  |    - 24h antes → /api/internal/reminders/qualified
  |    - 5min antes → /api/internal/reminders/5min
  v
Cloud Tasks dispara 24h antes
  |  POST /api/internal/reminders/qualified
  |  Envia WhatsApp interativo: "Confirma presenca?" [Si] [No]
  v
Worker responde
  |  Twilio POST /api/webhooks/twilio/inbound
  |  Roteia: confirm_* → HandleReminderResponseUseCase
  |
  |-- confirm_yes → interview_response = 'confirmed'
  |
  |-- confirm_no  → cancelSlot()
  |                  removeGuestFromMeeting()
  |                  interview_response = 'declined'
  |                  Notifica admin via WhatsApp
```

### Deduplicacao

O webhook do Talentum pode chegar duplicado. O sistema checa o `previousStage` retornado pelo upsert — so emite o domain event se o worker **transitou** para QUALIFIED (nao se ja era QUALIFIED).

### Idempotencia dos reminders

A coluna `interview_reminder_sent_at` na `worker_job_applications` garante que cada reminder e enviado no maximo uma vez. Se o Cloud Tasks fizer retry por falha de rede, o endpoint verifica essa coluna antes de reenviar.

### State machine de entrevista

Transicoes de `interview_response` sao validadas no dominio via `InterviewStateMachine`:

```
pending   → confirmed, declined
confirmed → declined
declined  → (estado final)
```

Transicoes invalidas sao bloqueadas antes de qualquer side effect.

## Endpoints

### Webhooks (externos)

| Metodo | Rota | Trigger | Funcao |
|--------|------|---------|--------|
| POST | `/api/webhooks/talentum/prescreening` | Talentum | Recebe statusLabel QUALIFIED, emite domain event |
| POST | `/api/webhooks/twilio/inbound` | Twilio | Recebe resposta do worker (botao slot ou confirmacao) |

### Internos (protegidos)

| Metodo | Rota | Trigger | Funcao |
|--------|------|---------|--------|
| POST | `/api/internal/events/process` | Pub/Sub push | Despacha domain event ao handler |
| POST | `/api/internal/outbox/process` | Pub/Sub push | Envia mensagem WhatsApp via Twilio |
| POST | `/api/internal/reminders/qualified` | Cloud Tasks | Envia reminder 24h antes |
| POST | `/api/internal/reminders/5min` | Cloud Tasks | Envia reminder 5min antes |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/application/usecases/ProcessTalentumPrescreening.ts` | Emite domain event na transicao para QUALIFIED (Transactional Outbox) |
| `src/application/use-cases/BookSlotFromWhatsAppUseCase.ts` | Orquestra booking: worker → slot → calendar → confirmacao → Cloud Tasks |
| `src/application/use-cases/HandleReminderResponseUseCase.ts` | Processa resposta do reminder (confirma ou declina com cleanup) |
| `src/infrastructure/events/handlers/QualifiedInterviewHandler.ts` | Reage ao evento QUALIFIED: enfileira WhatsApp interativo |
| `src/infrastructure/events/DomainEventProcessor.ts` | Despacha eventos para handlers registrados |
| `src/infrastructure/events/PubSubClient.ts` | Publish para Pub/Sub topics |
| `src/infrastructure/events/CloudTasksClient.ts` | Agenda/cancela Cloud Tasks |
| `src/infrastructure/services/ReminderScheduler.ts` | Agenda e processa reminders (24h + 5min) |
| `src/infrastructure/services/OutboxProcessor.ts` | Envia mensagens da outbox via Twilio |
| `src/infrastructure/services/TwilioMessagingService.ts` | Envio WhatsApp (Content API + free-form) |
| `src/infrastructure/services/GoogleCalendarService.ts` | addGuestToMeeting / removeGuestFromMeeting |
| `src/infrastructure/repositories/InterviewSlotRepository.ts` | Booking com optimistic lock |
| `src/interfaces/webhooks/controllers/InboundWhatsAppController.ts` | Recebe e roteia respostas WhatsApp |
| `src/interfaces/controllers/InternalController.ts` | Endpoints internos (events, outbox, reminders) |
| `src/domain/entities/InterviewStateMachine.ts` | Transicoes validas de interview_response |

## Regras de negocio

### Trigger
- Fluxo inicia quando `application_funnel_stage` transita para `QUALIFIED` via webhook Talentum
- Transicao detectada comparando `previousStage` com `statusLabel` do payload
- Evento so e emitido se houve transicao real (deduplicacao)
- dryRun=true (ambiente de teste) nao emite eventos

### Convite
- Vaga deve ter pelo menos 1 meet link configurado; sem links = warning no log, nao envia
- Worker recebe WhatsApp Interactive Message com ate 3 botoes (1 por meet link)
- Template Twilio Content API (`twilio/quick-reply`) com payloads `slot_1`, `slot_2`, `slot_3`
- Se Content Template nao aprovado ainda (content_sid NULL), fallback para texto simples com opcoes numeradas
- Nome do worker tokenizado via TokenService antes de guardar na outbox (protecao PII)

### Booking
- Worker escolhe tocando em botao → payload chega via webhook inbound Twilio
- Identificacao do worker por telefone normalizado (E.164)
- Mapeamento: `slot_N` → `meet_link_N` / `meet_datetime_N` da vaga
- Booking com optimistic lock (booked_count < max_capacity)
- Worker adicionado como convidado no Google Calendar (idempotente: ignora se ja convidado)
- Dados salvos em `worker_job_applications`: meet_link, datetime, slot_id, response='pending'
- 2 Cloud Tasks agendadas para momento exato: 24h e 5min antes da entrevista

### Reminder 24h
- Cloud Tasks dispara exatamente 24h antes da `interview_datetime`
- Envia WhatsApp interativo com 2 botoes: "Si, confirmo" (`confirm_yes`) / "No, no puedo" (`confirm_no`)
- Idempotente: verifica `interview_reminder_sent_at` antes de enviar
- Se worker ja respondeu (`interview_response != 'pending'`), pula silenciosamente

### Confirmacao
- `confirm_yes` → `interview_response` = `confirmed`, `interview_responded_at` = NOW()
- Transicao validada pelo InterviewStateMachine

### Declinio
- `confirm_no` → fluxo completo de cleanup:
  1. Libera slot (`interview_slots.booked_count` decrementado)
  2. Remove worker do Google Calendar (idempotente: ignora se nao convidado)
  3. Limpa dados da entrevista em `worker_job_applications` (meet_link, datetime, slot_id = NULL)
  4. Salva `interview_response` = `declined`, `interview_responded_at` = NOW()
  5. Notifica admin via WhatsApp com template `qualified_declined_admin`

### Roteamento inbound
- `InboundWhatsAppController` roteia por prefixo do `ButtonPayload`:
  - `slot_*` → `BookSlotFromWhatsAppUseCase`
  - `confirm_*` → `HandleReminderResponseUseCase`
  - Texto livre → ignorado (log informativo)
- Sempre retorna 200 OK para o Twilio (evita retries)

## Tabelas e colunas

### domain_events (nova)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK |
| event | TEXT | Tipo do evento (ex: `funnel_stage.qualified`) |
| payload | JSONB | Dados do evento (workerId, jobPostingId) |
| status | TEXT | `pending`, `processed`, `failed` |
| error | TEXT | Mensagem de erro (se falhou) |
| created_at | TIMESTAMPTZ | Quando o evento foi criado |
| processed_at | TIMESTAMPTZ | Quando foi processado |

### worker_job_applications (colunas adicionadas)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| interview_meet_link | TEXT | Google Meet link escolhido pelo worker |
| interview_datetime | TIMESTAMPTZ | Data/hora da entrevista agendada |
| interview_response | TEXT | `pending`, `confirmed`, `declined`, `no_response` |
| interview_responded_at | TIMESTAMPTZ | Quando o worker respondeu o reminder |
| interview_reminder_sent_at | TIMESTAMPTZ | Quando o reminder 24h foi enviado (idempotencia) |
| interview_slot_id | UUID FK | Referencia ao interview_slot reservado |

### message_templates (registros adicionados)
| Slug | Categoria | Descricao |
|------|-----------|-----------|
| `qualified_interview_invite` | recruitment | Convite com 3 opcoes de horario |
| `qualified_slot_confirmed` | recruitment | Confirmacao de agendamento |
| `qualified_reminder_confirm` | notification | Reminder 24h com botoes Si/No |
| `qualified_declined_admin` | internal | Notificacao ao admin quando worker declina |

## Templates WhatsApp (Twilio Console)

| Template | Tipo | Botoes | Payloads |
|----------|------|--------|----------|
| Interview Invite | `twilio/quick-reply` | 3 | `slot_1`, `slot_2`, `slot_3` |
| Confirm Reminder | `twilio/quick-reply` | 2 | `confirm_yes`, `confirm_no` |

Os `contentSid` (HXxxxxx) sao preenchidos em `message_templates.content_sid` apos aprovacao pelo WhatsApp Business.

## Integracoes externas

- **Talentum**: Webhook de prescreening (trigger do fluxo)
- **Twilio WhatsApp**: Envio de mensagens interativas (Content API) + webhook inbound para respostas
- **Google Calendar API**: Adicionar/remover worker como convidado no evento Meet
- **Google Cloud Pub/Sub**: Trigger imediato para eventos e outbox
- **Google Cloud Tasks**: Agendamento de reminders para momento exato (24h, 5min antes)
