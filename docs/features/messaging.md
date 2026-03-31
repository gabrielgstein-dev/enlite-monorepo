# Mensageria & Notificacoes (MSG)

## O que e

Sistema de mensagens via WhatsApp usando Twilio, com templates gerenciaveis, envio individual/em massa e rastreamento de entrega. Inclui bulk dispatch automatico diario para workers com cadastro incompleto e sistema de lembretes de entrevista.

## Por que existe

WhatsApp e o principal canal de comunicacao com ATs na America Latina. O sistema centraliza o envio, evita mensagens duplicadas, rasteia entregas e automatiza follow-ups para workers que nao completaram o cadastro.

## Como funciona

### Envio individual

```
Admin seleciona candidato no Match
  |  POST /api/admin/messaging/whatsapp
  |  { workerId, templateSlug, variables }
  v
Resolve template + substitui variaveis
  |  {{name}}, {{caseNumber}}, {{interviewDate}}, etc.
  v
Decripta telefone via KMS
  |  Envia via Twilio WhatsApp API
  v
Registra em messaging_outbox
  |  Twilio envia callback de status
  |  POST /api/webhooks/twilio/status
  v
Atualiza delivery_status (sent -> delivered / failed)
```

### Bulk dispatch (automatico diario)

```
Cloud Scheduler (10h BRT)
  |  POST /api/internal/bulk-dispatch/process
  v
Busca workers com:
  |  Encuadres SELECCIONADO ou REEMPLAZO
  |  AND (documentos incompletos OR perfil incompleto)
  |  Deduplicacao por worker_id
  v
Envia template "complete_register_ofc" com link de registro
  |  Log em whatsapp_bulk_dispatch_logs (triggered_by=system)
  v
Twilio callbacks atualizam status
```

### Templates

```
Admin cria template
  |  POST /api/admin/messaging/templates
  |  { slug, name, body, category }
  v
Armazenado com slug como chave unica
  |  Soft delete (deactivate) via DELETE
  v
Usado em envios individuais e bulk
```

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| POST | `/api/admin/messaging/whatsapp` | Enviar por worker ID |
| POST | `/api/admin/messaging/whatsapp/direct` | Enviar por telefone |
| GET | `/api/admin/messaging/templates` | Listar templates |
| POST | `/api/admin/messaging/templates` | Criar/upsert template |
| PUT | `/api/admin/messaging/templates/:slug` | Atualizar template |
| DELETE | `/api/admin/messaging/templates/:slug` | Desativar template |
| POST | `/api/admin/messaging/bulk-dispatch-incomplete` | Dispatch manual em massa |
| POST | `/api/internal/bulk-dispatch/process` | Trigger automatico diario |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/MessagingController.ts` | Envio + CRUD templates |
| `src/infrastructure/services/TwilioMessagingService.ts` | Integracao Twilio |
| `src/infrastructure/services/BulkDispatchScheduler.ts` | Scheduler diario |
| `src/application/use-cases/BulkDispatchIncompleteWorkersUseCase.ts` | Logica bulk |
| `src/infrastructure/repositories/MessageTemplateRepository.ts` | Persistencia templates |
| `src/domain/entities/MessageTemplate.ts` | Entidade template |

### Frontend

O envio de mensagens e feito via modais embutidos nas paginas de Match e Kanban:
- `VacancyMatchPage.tsx` — botao "Enviar mensagem" por candidato ou em batch
- `ScheduleInterviewModal.tsx` — envio automatico ao agendar

## Regras de negocio

- **Template CRUD**: slug como identificador unico; upsert na criacao
- **Variaveis**: `{{name}}`, `{{caseNumber}}`, `{{interviewDate}}`, etc.
- **Bulk dispatch**: Filtra workers com encuadres positivos + cadastro incompleto
- **Deduplicacao**: Por worker_id no bulk; evita envios duplicados
- **Tracking**: Duas tabelas — `whatsapp_bulk_dispatch_logs` (bulk) e `messaging_outbox` (individual)
- **Callbacks Twilio**: Status: sent, delivered, failed, undelivered
- **Sempre responde 200**: Ao Twilio, para evitar retries
- **Dry run**: `?dryRun=true` para preview sem envio real
- **Limite de teste**: `?limit=N` para testar com subset
- **Audit trail**: `triggered_by` registra quem disparou (admin uid ou "system")
- **Soft delete**: Templates desativados, nao removidos

## Integracoes externas

- **Twilio API**: Envio de WhatsApp (Content Templates)
- **Twilio Status Callbacks**: Rastreamento de entrega via webhook
- **Google Cloud KMS**: Decriptacao de telefones
- **Cloud Scheduler**: Trigger diario do bulk dispatch (10h BRT)
